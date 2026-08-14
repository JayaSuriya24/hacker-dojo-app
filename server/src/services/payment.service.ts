import type Stripe from 'stripe';
import { stripe, STRIPE_API_VERSION } from '../config/stripe.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { wifiService } from './wifi.service.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedUser } from '../types/http.js';
import type { BillingPeriod, MembershipStatus, PlanRow } from '../types/database.js';

/**
 * What the mobile Payment Sheet needs to open. Note what is NOT here: no secret
 * key, no price computed on the device. The amount is decided server-side from
 * the plan record, so a tampered request buys nothing at a discount.
 */
export interface PaymentSheetParams {
  paymentIntentClientSecret: string;
  /** Set only for subscriptions; the sheet uses whichever secret is present. */
  setupIntentClientSecret: string | null;
  ephemeralKeySecret: string;
  customerId: string;
  publishableAmountCents: number;
  paymentId: string;
  /** Present once a subscription exists, so the client can report progress. */
  subscriptionId: string | null;
}

export interface BillingPortalSession {
  url: string;
  returnUrl: string;
}

/**
 * Stripe's own subscription statuses, narrowed to the five the membership table
 * models. Anything else (`incomplete_expired`, `unpaid`, `paused`) means the
 * member is not currently entitled, which is `canceled` as far as access goes.
 */
function toMembershipStatus(status: Stripe.Subscription.Status): MembershipStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    default:
      return 'canceled';
  }
}

/**
 * The end of the period Stripe has actually billed for.
 *
 * Stripe moved `current_period_end` off the subscription and onto its items in
 * recent API versions; reading both means the field survives either shape
 * rather than silently becoming null and expiring a paying member.
 */
function periodEndOf(subscription: Stripe.Subscription): string | null {
  const onSubscription = (subscription as unknown as { current_period_end?: number })
    .current_period_end;
  const onItem = subscription.items?.data?.[0]?.current_period_end;
  const seconds = onSubscription ?? onItem;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function ensureStripeCustomer(user: AuthenticatedUser): Promise<string> {
  const membership = await profileRepository.membership(user.accessToken, user.id);
  if (membership?.stripe_customer_id) return membership.stripe_customer_id;

  // Reuse an existing customer when the email is already known to Stripe,
  // otherwise a member who cancels and rejoins accumulates duplicate customers
  // and loses their saved payment methods.
  const existing = await stripe.customers.list({ email: user.email, limit: 1 });
  const found = existing.data[0];
  if (found) return found.id;

  const created = await stripe.customers.create({
    email: user.email,
    metadata: { profileId: user.id },
  });
  return created.id;
}

/**
 * The Stripe Price a plan bills against for a given period.
 *
 * Prices live in Stripe and their ids are stored on the plan row. A plan with
 * no price id cannot be subscribed to — that is a configuration error worth
 * failing loudly on rather than falling back to a one-off charge, which is how
 * memberships ended up never renewing in the first place.
 */
function priceIdFor(plan: PlanRow, period: BillingPeriod): string {
  const priceId = period === 'year' ? plan.stripe_price_annual : plan.stripe_price_monthly;

  if (!priceId) {
    throw AppError.badRequest(
      period === 'year'
        ? `${plan.name} is not offered on an annual basis.`
        : `${plan.name} is not available for checkout right now.`,
    );
  }

  return priceId;
}

export const paymentService = {
  /**
   * Start a membership subscription.
   *
   * This used to create a bare PaymentIntent and write `current_period_end =
   * now + 30 days`, which meant every membership silently lapsed after one
   * period and the `customer.subscription.*` handlers could never match a row
   * because `stripe_subscription_id` was always null.
   *
   * It now creates a real Subscription with `payment_behavior:
   * 'default_incomplete'`, which returns the first invoice's PaymentIntent for
   * the sheet to confirm and leaves the subscription inactive until it does.
   * Renewals, dunning and cancellation then arrive as webhooks for free.
   */
  async createMembershipIntent(
    user: AuthenticatedUser,
    input: { planId: string; period: BillingPeriod; idempotencyKey: string },
  ): Promise<PaymentSheetParams> {
    const plan = await profileRepository.planById(input.planId);
    if (!plan || !plan.active) throw AppError.notFound('That plan is not available.');

    const amountCents =
      input.period === 'year' ? plan.price_annual_cents : plan.price_monthly_cents;
    if (!amountCents) {
      throw AppError.badRequest(`${plan.name} is not offered on an annual basis.`);
    }

    const priceId = priceIdFor(plan, input.period);

    // A retried tap replays the stored intent rather than opening a second
    // subscription. Stripe's own idempotency key covers the call below; this
    // covers the whole operation, including the rows we wrote around it.
    const replay = await paymentRepository.findByIdempotencyKey(input.idempotencyKey);
    if (replay?.stripe_payment_intent_id) {
      const intent = await stripe.paymentIntents.retrieve(replay.stripe_payment_intent_id);
      const customerId = typeof intent.customer === 'string' ? intent.customer : '';
      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: STRIPE_API_VERSION },
      );

      return {
        paymentIntentClientSecret: intent.client_secret ?? '',
        setupIntentClientSecret: null,
        ephemeralKeySecret: ephemeralKey.secret ?? '',
        customerId,
        publishableAmountCents: replay.amount_cents,
        paymentId: replay.id,
        subscriptionId: (replay.metadata['subscriptionId'] as string | undefined) ?? null,
      };
    }

    const customerId = await ensureStripeCustomer(user);

    const payment = await paymentRepository.create({
      profileId: user.id,
      kind: 'membership',
      amountCents,
      idempotencyKey: input.idempotencyKey,
      stripeCustomerId: customerId,
      metadata: { planId: plan.id, planName: plan.name, period: input.period },
    });

    const subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: priceId }],
        // Leaves the subscription `incomplete` until the sheet confirms the
        // first invoice, so an abandoned checkout never grants access.
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
          payment_method_types: ['card'],
        },
        expand: ['latest_invoice.confirmation_secret', 'pending_setup_intent'],
        // Read back by the webhook. This is the only channel that decides who
        // gets a membership; nothing from the client's confirmation call does.
        metadata: {
          paymentId: payment.id,
          profileId: user.id,
          planId: plan.id,
          period: input.period,
          kind: 'membership',
        },
      },
      { idempotencyKey: `sub_${input.idempotencyKey}` },
    );

    const invoice = subscription.latest_invoice;
    const clientSecret =
      typeof invoice === 'object' && invoice
        ? (invoice.confirmation_secret?.client_secret ?? null)
        : null;

    const setupIntent = subscription.pending_setup_intent;
    const setupSecret =
      typeof setupIntent === 'object' && setupIntent ? (setupIntent.client_secret ?? null) : null;

    if (!clientSecret && !setupSecret) {
      logger.error(
        { subscriptionId: subscription.id },
        'Subscription created without a confirmable secret',
      );
      throw AppError.upstream('We could not start that subscription. Try again shortly.');
    }

    const intentId =
      typeof invoice === 'object' &&
      invoice &&
      typeof invoice.payments?.data?.[0]?.payment === 'object'
        ? ((invoice.payments.data[0]?.payment as { payment_intent?: string } | undefined)
            ?.payment_intent ?? null)
        : null;

    await paymentRepository.attachSubscription(payment.id, {
      subscriptionId: subscription.id,
      paymentIntentId: intentId,
    });

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: STRIPE_API_VERSION },
    );

    return {
      paymentIntentClientSecret: clientSecret ?? '',
      setupIntentClientSecret: setupSecret,
      ephemeralKeySecret: ephemeralKey.secret ?? '',
      customerId,
      publishableAmountCents: amountCents,
      paymentId: payment.id,
      subscriptionId: subscription.id,
    };
  },

  /**
   * A Billing Portal session.
   *
   * Replaces the hardcoded `billing.stripe.com/p/login/hackerdojo` link in
   * Settings, which was not a real portal URL. Stripe hosts the whole surface —
   * payment methods, invoices, cancellation — so none of it has to be rebuilt
   * here, and the member is returned to the app by deep link afterwards.
   */
  async createBillingPortalSession(user: AuthenticatedUser): Promise<BillingPortalSession> {
    const membership = await profileRepository.membership(user.accessToken, user.id);
    const customerId = membership?.stripe_customer_id ?? (await ensureStripeCustomer(user));

    const returnUrl = env.BILLING_PORTAL_RETURN_URL;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url, returnUrl };
  },

  /**
   * Donations. Unlike memberships the amount does come from the client — it is
   * a free-entry field — so it is bounded on both ends here.
   */
  async createDonationIntent(
    user: AuthenticatedUser | undefined,
    input: { amountCents: number; idempotencyKey: string; receiptEmail?: string | undefined },
  ): Promise<{ paymentIntentClientSecret: string; paymentId: string }> {
    if (input.amountCents < 100) {
      throw AppError.badRequest('The smallest donation we can process is $1.');
    }
    if (input.amountCents > env.MAX_DONATION_CENTS) {
      throw AppError.badRequest(
        'That is larger than we can take through the app — get in touch and we will arrange it.',
      );
    }

    const replay = await paymentRepository.findByIdempotencyKey(input.idempotencyKey);
    if (replay?.stripe_payment_intent_id) {
      const intent = await stripe.paymentIntents.retrieve(replay.stripe_payment_intent_id);
      return { paymentIntentClientSecret: intent.client_secret ?? '', paymentId: replay.id };
    }

    const payment = await paymentRepository.create({
      profileId: user?.id ?? null,
      kind: 'donation',
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
      metadata: { receiptEmail: input.receiptEmail ?? user?.email ?? null },
    });

    const receiptEmail = input.receiptEmail ?? user?.email;

    const intent = await stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        description: `Donation — Hacker Dojo (501(c)(3), EIN ${env.DOJO_EIN})`,
        ...(receiptEmail ? { receipt_email: receiptEmail } : {}),
        metadata: {
          paymentId: payment.id,
          profileId: user?.id ?? '',
          kind: 'donation',
        },
      },
      { idempotencyKey: input.idempotencyKey },
    );

    await paymentRepository.attachIntent(payment.id, intent.id);

    return { paymentIntentClientSecret: intent.client_secret ?? '', paymentId: payment.id };
  },

  /**
   * Webhook handling — the only place a membership is granted.
   *
   * The signature is verified before this runs. The replay guard is now two
   * steps rather than one: `claimWebhookEvent` reserves the id, and
   * `markWebhookProcessed` confirms it only after the work below succeeded. The
   * previous single-step version marked the event processed at the moment of
   * receipt, so anything that threw afterwards left Stripe's retry to be
   * discarded as "already handled" — a member could pay and never be activated.
   *
   * On failure the claim is released and the error rethrown, which makes the
   * controller answer non-2xx and Stripe redeliver.
   */
  async handleWebhook(event: Stripe.Event): Promise<void> {
    const claim = await paymentRepository.claimWebhookEvent(event.id, event.type);

    if (claim === 'already_processed') {
      logger.info({ eventId: event.id, type: event.type }, 'Ignoring replayed Stripe event');
      return;
    }

    try {
      await this.processWebhookEvent(event);
      await paymentRepository.markWebhookProcessed(event.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await paymentRepository.markWebhookFailed(event.id, message);
      logger.error(
        { err: error, eventId: event.id, type: event.type },
        'Stripe event processing failed — released for redelivery',
      );
      throw error;
    }
  },

  /** The work itself, split out so the claim/confirm wrapper stays readable. */
  async processWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      /**
       * The subscription lifecycle. Every one of these carries the current
       * status and period end, so activation, renewal, dunning and cancellation
       * are the same write with different values rather than four code paths.
       */
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await this.syncSubscription(subscription);
        return;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const subscriptionId = subscriptionIdOf(invoice);
        if (!subscriptionId) return;

        // Re-read rather than trusting the invoice's copy: the subscription is
        // the record of entitlement, and it may have moved since this invoice
        // was generated.
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await this.syncSubscription(subscription);
        return;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = subscriptionIdOf(invoice);
        if (!subscriptionId) return;

        await paymentRepository.updateMembershipBySubscription(subscriptionId, {
          status: 'past_due',
        });
        logger.warn({ subscriptionId }, 'Subscription invoice failed — membership marked past due');
        return;
      }

      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        const payment = await paymentRepository.markStatus(intent.id, 'succeeded');
        const metadata = intent.metadata ?? {};

        if (metadata['kind'] === 'donation') {
          if (!payment) {
            logger.warn({ intentId: intent.id }, 'Succeeded donation has no matching payment row');
            return;
          }
          await paymentRepository.recordDonation({
            paymentId: payment.id,
            profileId: metadata['profileId'] || null,
            amountCents: intent.amount_received || intent.amount,
            anonymous: !metadata['profileId'],
            receiptEmail: intent.receipt_email ?? null,
          });
        }

        // Membership entitlement deliberately does NOT key off this event any
        // more — `customer.subscription.*` is the authority, and granting here
        // too would race it.
        return;
      }

      case 'payment_intent.payment_failed': {
        await paymentRepository.markStatus(event.data.object.id, 'failed');
        return;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        if (typeof charge.payment_intent === 'string') {
          await paymentRepository.markStatus(charge.payment_intent, 'refunded');
        }
        return;
      }

      default:
        logger.debug({ type: event.type }, 'Unhandled Stripe event type');
    }
  },

  /**
   * Reconcile one Stripe subscription into `memberships`.
   *
   * Idempotent by construction: it upserts on `stripe_subscription_id`, so
   * replays and out-of-order deliveries converge on the same row rather than
   * stacking memberships. The plan comes from the subscription's metadata,
   * falling back to a lookup by Price id for subscriptions created in the
   * Stripe dashboard rather than by this API.
   */
  async syncSubscription(subscription: Stripe.Subscription): Promise<void> {
    const metadata = subscription.metadata ?? {};
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

    let profileId = metadata['profileId'] ?? null;
    if (!profileId) {
      profileId = await paymentRepository.profileIdForCustomer(customerId);
    }
    if (!profileId) {
      logger.warn(
        { subscriptionId: subscription.id, customerId },
        'Subscription has no profile to attach to',
      );
      return;
    }

    const priceId = subscription.items.data[0]?.price.id ?? null;
    let planId = metadata['planId'] ?? null;
    if (!planId && priceId) {
      planId = await paymentRepository.planIdForPrice(priceId);
    }
    if (!planId) {
      logger.warn({ subscriptionId: subscription.id, priceId }, 'Subscription has no known plan');
      return;
    }

    const interval = subscription.items.data[0]?.price.recurring?.interval;
    const period: BillingPeriod =
      metadata['period'] === 'year' || interval === 'year' ? 'year' : 'month';

    await paymentRepository.upsertMembershipFromSubscription({
      profileId,
      planId,
      period,
      status: toMembershipStatus(subscription.status),
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: periodEndOf(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });

    logger.info(
      { profileId, subscriptionId: subscription.id, status: subscription.status },
      'Membership synchronised from subscription',
    );

    // A member who can now get through the door can also get on the member
    // network, so the credential is issued by the same event that grants the
    // entitlement. It issues once and emails once — see `onMembershipActivated`
    // — because these events fire on every renewal and status change.
    //
    // Awaited but never allowed to throw: this runs inside the webhook's
    // claim/confirm wrapper, and an exception here would leave a paid-for
    // membership looking unprocessed and get the whole event retried.
    const status = toMembershipStatus(subscription.status);
    if (status === 'active' || status === 'trialing') {
      await wifiService.onMembershipActivated(profileId);
    }
  },
};

/** Stripe moved `subscription` onto invoice parent lines; read either shape. */
function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const direct = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object') return direct.id;

  const parent = invoice.parent?.subscription_details?.subscription;
  if (typeof parent === 'string') return parent;
  if (parent && typeof parent === 'object') return parent.id;

  return null;
}
