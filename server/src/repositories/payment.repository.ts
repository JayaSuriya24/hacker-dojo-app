import { adminClient } from '../config/supabase.js';
import { unwrap, unwrapMaybe } from '../utils/postgrest.js';
import type {
  Json,
  BillingPeriod,
  MembershipRow,
  MembershipStatus,
  PaymentRow,
  PaymentStatus,
} from '../types/database.js';

export interface CreatePaymentInput {
  profileId: string | null;
  kind: PaymentRow['kind'];
  amountCents: number;
  idempotencyKey: string;
  stripeCustomerId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/** The outcome of reserving a webhook event id. */
export type WebhookClaim = 'claimed' | 'already_processed';

/**
 * Money.
 *
 * Every function here runs as the service role, because no client may write a
 * payment row — a client that could set `status = 'succeeded'` would have
 * granted itself a membership. Reads go through RLS elsewhere.
 */
export const paymentRepository = {
  /** Returns the existing row when the key was seen before, so a retried tap is a no-op. */
  async findByIdempotencyKey(key: string): Promise<PaymentRow | null> {
    return unwrapMaybe(
      await adminClient
        .from('payments')
        .select('*')
        .eq('idempotency_key', key)
        .maybeSingle<PaymentRow>(),
      'Could not check that payment.',
    );
  },

  async create(input: CreatePaymentInput): Promise<PaymentRow> {
    return unwrap(
      await adminClient
        .from('payments')
        .insert({
          profile_id: input.profileId,
          kind: input.kind,
          amount_cents: input.amountCents,
          idempotency_key: input.idempotencyKey,
          stripe_customer_id: input.stripeCustomerId ?? null,
          metadata: (input.metadata ?? {}) as Json,
        })
        .select('*')
        .single<PaymentRow>(),
      'Could not start that payment.',
    );
  },

  async attachIntent(id: string, paymentIntentId: string): Promise<void> {
    const { error } = await adminClient
      .from('payments')
      .update({ stripe_payment_intent_id: paymentIntentId, status: 'processing' })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  /**
   * Record the subscription a membership payment belongs to.
   *
   * The subscription id goes into `metadata` rather than a new column: the
   * authoritative copy lives on `memberships.stripe_subscription_id`, and this
   * is only so a replayed checkout can report the same subscription back to the
   * client without another Stripe round trip.
   */
  async attachSubscription(
    id: string,
    input: { subscriptionId: string; paymentIntentId: string | null },
  ): Promise<void> {
    const existing = unwrap(
      await adminClient.from('payments').select('metadata').eq('id', id).single<{
        metadata: Record<string, unknown>;
      }>(),
      'Could not read that payment back.',
    );

    const { error } = await adminClient
      .from('payments')
      .update({
        status: 'processing',
        metadata: { ...existing.metadata, subscriptionId: input.subscriptionId },
        ...(input.paymentIntentId ? { stripe_payment_intent_id: input.paymentIntentId } : {}),
      })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  async markStatus(paymentIntentId: string, status: PaymentStatus): Promise<PaymentRow | null> {
    return unwrapMaybe(
      await adminClient
        .from('payments')
        .update({ status })
        .eq('stripe_payment_intent_id', paymentIntentId)
        .select('*')
        .maybeSingle<PaymentRow>(),
      'Could not update that payment.',
    );
  },

  async recordDonation(input: {
    paymentId: string;
    profileId: string | null;
    amountCents: number;
    anonymous: boolean;
    receiptEmail: string | null;
  }): Promise<void> {
    const { error } = await adminClient.from('donations').insert({
      payment_id: input.paymentId,
      profile_id: input.profileId,
      amount_cents: input.amountCents,
      anonymous: input.anonymous,
      receipt_email: input.receiptEmail,
    });

    if (error) throw new Error(error.message);
  },

  /**
   * Reserve a webhook event id.
   *
   * Stripe redelivers on any non-2xx and occasionally on a 2xx, so the id is
   * inserted before the work starts. What changed is the second half: a row
   * whose `processed_at` is still null was claimed but never finished, and a
   * redelivery of it must be processed rather than dropped. Only a row that
   * reached `markWebhookProcessed` reports `already_processed`.
   *
   * The `attempts` counter is bumped on every claim so a poison event is
   * visible in the table rather than only in the logs.
   */
  async claimWebhookEvent(id: string, type: string): Promise<WebhookClaim> {
    const { error } = await adminClient.from('stripe_webhook_events').insert({ id, type });

    if (!error) return 'claimed';
    if (error.code !== '23505') throw new Error(error.message);

    const existing = unwrapMaybe(
      await adminClient
        .from('stripe_webhook_events')
        .select('processed_at, attempts')
        .eq('id', id)
        .maybeSingle<{ processed_at: string | null; attempts: number }>(),
      'Could not check that webhook event.',
    );

    if (existing?.processed_at) return 'already_processed';

    // Claimed but unfinished — a previous attempt threw. Take it again.
    const { error: bumpError } = await adminClient
      .from('stripe_webhook_events')
      .update({ attempts: (existing?.attempts ?? 0) + 1 })
      .eq('id', id);

    if (bumpError) throw new Error(bumpError.message);
    return 'claimed';
  },

  async markWebhookProcessed(id: string): Promise<void> {
    const { error } = await adminClient
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString(), last_error: null })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  /**
   * Record why an event failed, leaving `processed_at` null so Stripe's next
   * delivery is treated as fresh work.
   */
  async markWebhookFailed(id: string, message: string): Promise<void> {
    const { error } = await adminClient
      .from('stripe_webhook_events')
      .update({ last_error: message.slice(0, 500) })
      .eq('id', id);

    // A failure to record a failure must not mask the original error.
    if (error) throw new Error(error.message);
  },

  /**
   * Upsert a membership from a Stripe subscription.
   *
   * Keyed on `stripe_subscription_id`, which is unique, so redelivered and
   * out-of-order webhooks converge rather than stacking rows. The prior
   * membership is retired first because `memberships_one_active_per_profile`
   * permits only one live row per person — an upgrade has to close the old one.
   */
  async upsertMembershipFromSubscription(input: {
    profileId: string;
    planId: string;
    period: BillingPeriod;
    status: MembershipStatus;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  }): Promise<MembershipRow> {
    const existing = unwrapMaybe(
      await adminClient
        .from('memberships')
        .select('*')
        .eq('stripe_subscription_id', input.stripeSubscriptionId)
        .maybeSingle<MembershipRow>(),
      'Could not load that membership.',
    );

    const patch = {
      profile_id: input.profileId,
      plan_id: input.planId,
      status: input.status,
      period: input.period,
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscriptionId,
      current_period_end: input.currentPeriodEnd,
      cancel_at_period_end: input.cancelAtPeriodEnd,
    };

    if (existing) {
      const updated = unwrap(
        await adminClient
          .from('memberships')
          .update(patch)
          .eq('id', existing.id)
          .select('*')
          .single<MembershipRow>(),
        'Could not update that membership.',
      );
      await this.syncRoleForMembership(input.profileId, input.status);
      return updated;
    }

    // Only retire the previous membership when this one is going to be live;
    // a `canceled` subscription arriving first must not strip a member of an
    // active plan they still hold.
    if (input.status === 'active' || input.status === 'trialing') {
      await adminClient
        .from('memberships')
        .update({ status: 'canceled' })
        .eq('profile_id', input.profileId)
        .neq('stripe_subscription_id', input.stripeSubscriptionId)
        .in('status', ['active', 'trialing', 'past_due']);
    }

    const created = unwrap(
      await adminClient.from('memberships').insert(patch).select('*').single<MembershipRow>(),
      'Could not activate that membership.',
    );

    await this.syncRoleForMembership(input.profileId, input.status);
    return created;
  },

  /**
   * Promote a paying member out of `guest`.
   *
   * Only ever moves `guest` → `member`: staff and admin roles are assigned by a
   * human and must survive a billing event. Demotion on cancellation is
   * deliberately not done here — `is_active_member()` reads the membership, so
   * access lapses on its own, and stripping the role would also drop a former
   * member's own historical rows out from under them.
   */
  async syncRoleForMembership(profileId: string, status: MembershipStatus): Promise<void> {
    if (status !== 'active' && status !== 'trialing') return;

    const { error } = await adminClient
      .from('profiles')
      .update({ role: 'member' })
      .eq('id', profileId)
      .eq('role', 'guest');

    if (error) throw new Error(error.message);
  },

  async updateMembershipBySubscription(
    subscriptionId: string,
    patch: Partial<Pick<MembershipRow, 'status' | 'current_period_end' | 'cancel_at_period_end'>>,
  ): Promise<void> {
    const { error } = await adminClient
      .from('memberships')
      .update(patch)
      .eq('stripe_subscription_id', subscriptionId);

    if (error) throw new Error(error.message);
  },

  /**
   * Which profile a Stripe customer belongs to.
   *
   * Needed for subscriptions created outside this API — a steward comping a
   * membership from the Stripe dashboard produces an event with no metadata.
   */
  async profileIdForCustomer(customerId: string): Promise<string | null> {
    const row = unwrapMaybe(
      await adminClient
        .from('memberships')
        .select('profile_id')
        .eq('stripe_customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ profile_id: string }>(),
      'Could not resolve that customer.',
    );

    return row?.profile_id ?? null;
  },

  /** Which plan a Stripe Price belongs to, for the same reason. */
  async planIdForPrice(priceId: string): Promise<string | null> {
    const row = unwrapMaybe(
      await adminClient
        .from('plans')
        .select('id')
        .or(`stripe_price_monthly.eq.${priceId},stripe_price_annual.eq.${priceId}`)
        .maybeSingle<{ id: string }>(),
      'Could not resolve that price.',
    );

    return row?.id ?? null;
  },
};
