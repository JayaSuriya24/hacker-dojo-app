import type Stripe from 'stripe';
import { stripe } from '../config/stripe.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedUser } from '../types/http.js';
import type { BillingPeriod } from '../types/database.js';

/**
 * What the mobile Payment Sheet needs to open. Note what is NOT here: no secret
 * key, no price computed on the device. The amount is decided server-side from
 * the plan record, so a tampered request buys nothing at a discount.
 */
export interface PaymentSheetParams {
  paymentIntentClientSecret: string;
  ephemeralKeySecret: string;
  customerId: string;
  publishableAmountCents: number;
  paymentId: string;
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

export const paymentService = {
  /**
   * Create a Payment Intent for a membership plan.
   *
   * The price is read from the `plans` table. The client sends a plan id and a
   * period, never an amount. `idempotencyKey` is client-generated and unique
   * per checkout attempt, so a double tap or a retry after a dropped response
   * returns the same intent rather than charging twice.
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

    const replay = await paymentRepository.findByIdempotencyKey(input.idempotencyKey);
    if (replay?.stripe_payment_intent_id) {
      const intent = await stripe.paymentIntents.retrieve(replay.stripe_payment_intent_id);
      const customerId = typeof intent.customer === 'string' ? intent.customer : '';
      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: '2026-07-29.dahlia' },
      );

      return {
        paymentIntentClientSecret: intent.client_secret ?? '',
        ephemeralKeySecret: ephemeralKey.secret ?? '',
        customerId,
        publishableAmountCents: replay.amount_cents,
        paymentId: replay.id,
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

    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        customer: customerId,
        // Lets Stripe surface Apple Pay and Google Pay without the client
        // enumerating payment methods per platform.
        automatic_payment_methods: { enabled: true },
        setup_future_usage: 'off_session',
        description: `Hacker Dojo — ${plan.name} membership (${input.period}ly)`,
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
      { idempotencyKey: input.idempotencyKey },
    );

    await paymentRepository.attachIntent(payment.id, intent.id);

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2026-07-29.dahlia' },
    );

    return {
      paymentIntentClientSecret: intent.client_secret ?? '',
      ephemeralKeySecret: ephemeralKey.secret ?? '',
      customerId,
      publishableAmountCents: amountCents,
      paymentId: payment.id,
    };
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
        description: 'Donation — Hacker Dojo (501(c)(3), EIN 26-4812213)',
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
   * The signature is verified before this runs. Replays are dropped by the
   * `claimWebhookEvent` insert, so Stripe's at-least-once delivery becomes
   * effectively-once processing.
   */
  async handleWebhook(event: Stripe.Event): Promise<void> {
    const isNew = await paymentRepository.claimWebhookEvent(event.id, event.type);
    if (!isNew) {
      logger.info({ eventId: event.id, type: event.type }, 'Ignoring replayed Stripe event');
      return;
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        const payment = await paymentRepository.markStatus(intent.id, 'succeeded');
        if (!payment) {
          logger.warn({ intentId: intent.id }, 'Succeeded intent has no matching payment row');
          return;
        }

        const metadata = intent.metadata ?? {};

        if (metadata['kind'] === 'membership' && metadata['profileId'] && metadata['planId']) {
          await paymentRepository.activateMembership({
            profileId: metadata['profileId'],
            planId: metadata['planId'],
            period: metadata['period'] === 'year' ? 'year' : 'month',
            stripeCustomerId: typeof intent.customer === 'string' ? intent.customer : null,
            stripeSubscriptionId: null,
            currentPeriodEnd: new Date(
              Date.now() + (metadata['period'] === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000,
            ).toISOString(),
          });
          logger.info({ profileId: metadata['profileId'] }, 'Membership activated');
        }

        if (metadata['kind'] === 'donation') {
          await paymentRepository.recordDonation({
            paymentId: payment.id,
            profileId: metadata['profileId'] || null,
            amountCents: intent.amount_received || intent.amount,
            anonymous: !metadata['profileId'],
            receiptEmail: intent.receipt_email ?? null,
          });
        }
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

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const periodEnd = (subscription as { current_period_end?: number }).current_period_end;

        await paymentRepository.updateMembershipBySubscription(subscription.id, {
          status:
            subscription.status === 'active'
              ? 'active'
              : subscription.status === 'past_due'
                ? 'past_due'
                : subscription.status === 'trialing'
                  ? 'trialing'
                  : 'canceled',
          cancel_at_period_end: subscription.cancel_at_period_end ?? false,
          ...(periodEnd ? { current_period_end: new Date(periodEnd * 1000).toISOString() } : {}),
        });
        return;
      }

      default:
        logger.debug({ type: event.type }, 'Unhandled Stripe event type');
    }
  },
};
