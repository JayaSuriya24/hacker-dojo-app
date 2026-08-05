import { adminClient } from '../config/supabase.js';
import { unwrap, unwrapMaybe } from '../utils/postgrest.js';
import type { BillingPeriod, MembershipRow, PaymentRow, PaymentStatus } from '../types/database.js';

export interface CreatePaymentInput {
  profileId: string | null;
  kind: PaymentRow['kind'];
  amountCents: number;
  idempotencyKey: string;
  stripeCustomerId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

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
          metadata: input.metadata ?? {},
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
   * Webhook replay guard. Stripe redelivers on any non-2xx and occasionally on
   * a 2xx; inserting the event id first makes a second delivery a cheap
   * unique-violation instead of a second membership activation.
   *
   * @returns true when this is the first time we have seen the event.
   */
  async claimWebhookEvent(id: string, type: string): Promise<boolean> {
    const { error } = await adminClient.from('stripe_webhook_events').insert({ id, type });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw new Error(error.message);
  },

  async activateMembership(input: {
    profileId: string;
    planId: string;
    period: BillingPeriod;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
  }): Promise<MembershipRow> {
    // Retire any prior membership first: the exclusion constraint permits only
    // one live row per profile, so an upgrade must close the old one.
    await adminClient
      .from('memberships')
      .update({ status: 'canceled' })
      .eq('profile_id', input.profileId)
      .in('status', ['active', 'trialing', 'past_due']);

    const membership = unwrap(
      await adminClient
        .from('memberships')
        .insert({
          profile_id: input.profileId,
          plan_id: input.planId,
          status: 'active',
          period: input.period,
          stripe_customer_id: input.stripeCustomerId,
          stripe_subscription_id: input.stripeSubscriptionId,
          current_period_end: input.currentPeriodEnd,
        })
        .select('*')
        .single<MembershipRow>(),
      'Could not activate that membership.',
    );

    // A paying member is a member: promote from 'guest' so the member-only RLS
    // policies start applying. Existing staff/admin roles are left alone.
    await adminClient
      .from('profiles')
      .update({ role: 'member' })
      .eq('id', input.profileId)
      .eq('role', 'guest');

    return membership;
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
};
