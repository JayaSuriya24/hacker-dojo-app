import { beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { paymentService } from '../payment.service.js';
import { paymentRepository } from '../../repositories/payment.repository.js';
import { profileRepository } from '../../repositories/profile.repository.js';
import { stripe } from '../../config/stripe.js';

vi.mock('../../repositories/payment.repository.js', () => ({
  paymentRepository: {
    claimWebhookEvent: vi.fn(),
    markWebhookProcessed: vi.fn(),
    markWebhookFailed: vi.fn(),
    markStatus: vi.fn(),
    recordDonation: vi.fn(),
    upsertMembershipFromSubscription: vi.fn(),
    updateMembershipBySubscription: vi.fn(),
    profileIdForCustomer: vi.fn(),
    planIdForPrice: vi.fn(),
    findByIdempotencyKey: vi.fn(),
    create: vi.fn(),
    attachIntent: vi.fn(),
    attachSubscription: vi.fn(),
  },
}));

vi.mock('../../repositories/profile.repository.js', () => ({
  profileRepository: { membership: vi.fn(), planById: vi.fn() },
}));

vi.mock('../../config/stripe.js', () => ({
  STRIPE_API_VERSION: '2026-07-29.dahlia',
  isStripeConfigured: true,
  stripe: {
    subscriptions: { retrieve: vi.fn(), create: vi.fn(), update: vi.fn(), cancel: vi.fn() },
    paymentIntents: { retrieve: vi.fn(), create: vi.fn() },
    ephemeralKeys: { create: vi.fn() },
    customers: { list: vi.fn(), create: vi.fn() },
    billingPortal: { sessions: { create: vi.fn() } },
  },
}));

const PROFILE = '22222222-2222-4222-8222-222222222222';

/** A subscription shaped like the fields the service actually reads. */
function subscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: 'sub_123',
    status: 'active',
    customer: 'cus_123',
    cancel_at_period_end: false,
    metadata: { profileId: PROFILE, planId: 'standard', period: 'month' },
    items: {
      data: [
        {
          current_period_end: 1_800_000_000,
          price: { id: 'price_monthly', recurring: { interval: 'month' } },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function event(type: string, object: unknown, id = 'evt_1'): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(paymentRepository.claimWebhookEvent).mockResolvedValue('claimed');
});

/**
 * The claim/confirm protocol.
 *
 * The old implementation marked an event processed at the moment of receipt, so
 * anything that threw afterwards left Stripe's retry to be discarded as already
 * handled — a member could pay and never be activated. These four tests are the
 * contract that replaced it.
 */
describe('paymentService.handleWebhook', () => {
  it('confirms the claim only after the work succeeds', async () => {
    await paymentService.handleWebhook(event('customer.subscription.created', subscription()));

    expect(paymentRepository.upsertMembershipFromSubscription).toHaveBeenCalledOnce();
    expect(paymentRepository.markWebhookProcessed).toHaveBeenCalledWith('evt_1');
    expect(paymentRepository.markWebhookFailed).not.toHaveBeenCalled();
  });

  it('releases the claim and rethrows when processing fails, so Stripe retries', async () => {
    vi.mocked(paymentRepository.upsertMembershipFromSubscription).mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(
      paymentService.handleWebhook(event('customer.subscription.created', subscription())),
    ).rejects.toThrow('database unavailable');

    expect(paymentRepository.markWebhookFailed).toHaveBeenCalledWith(
      'evt_1',
      'database unavailable',
    );
    // Crucially NOT marked processed — the redelivery has to be treated as new.
    expect(paymentRepository.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it('drops a genuine replay without doing the work twice', async () => {
    vi.mocked(paymentRepository.claimWebhookEvent).mockResolvedValue('already_processed');

    await paymentService.handleWebhook(event('customer.subscription.created', subscription()));

    expect(paymentRepository.upsertMembershipFromSubscription).not.toHaveBeenCalled();
    expect(paymentRepository.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it('processes a redelivery of an event that previously failed', async () => {
    // `claimWebhookEvent` returns 'claimed' for a row whose processed_at is null.
    vi.mocked(paymentRepository.claimWebhookEvent).mockResolvedValue('claimed');

    await paymentService.handleWebhook(event('customer.subscription.created', subscription()));

    expect(paymentRepository.upsertMembershipFromSubscription).toHaveBeenCalledOnce();
  });
});

describe('paymentService.syncSubscription', () => {
  it('maps an active subscription onto an active membership', async () => {
    await paymentService.syncSubscription(subscription());

    expect(paymentRepository.upsertMembershipFromSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PROFILE,
        planId: 'standard',
        status: 'active',
        period: 'month',
        stripeSubscriptionId: 'sub_123',
        cancelAtPeriodEnd: false,
      }),
    );
  });

  it.each([
    ['past_due', 'past_due'],
    ['trialing', 'trialing'],
    ['canceled', 'canceled'],
    ['unpaid', 'canceled'],
    ['incomplete_expired', 'canceled'],
    ['paused', 'canceled'],
  ])('narrows Stripe status %s to membership status %s', async (stripeStatus, expected) => {
    await paymentService.syncSubscription(
      subscription({ status: stripeStatus as Stripe.Subscription.Status }),
    );

    expect(paymentRepository.upsertMembershipFromSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ status: expected }),
    );
  });

  it('reads the period end off the subscription item', async () => {
    await paymentService.syncSubscription(subscription());

    expect(paymentRepository.upsertMembershipFromSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPeriodEnd: new Date(1_800_000_000 * 1000).toISOString(),
      }),
    );
  });

  it('derives the period from the price when metadata is absent', async () => {
    await paymentService.syncSubscription(
      subscription({
        metadata: {},
        items: {
          data: [
            {
              current_period_end: 1_800_000_000,
              price: { id: 'price_annual', recurring: { interval: 'year' } },
            },
          ],
        },
      } as unknown as Partial<Stripe.Subscription>),
    );

    // Falls back to the customer and price lookups for a dashboard-created sub.
    expect(paymentRepository.profileIdForCustomer).toHaveBeenCalledWith('cus_123');
  });

  it('skips a subscription it cannot attach to a profile', async () => {
    vi.mocked(paymentRepository.profileIdForCustomer).mockResolvedValue(null);

    await paymentService.syncSubscription(subscription({ metadata: {} }));

    expect(paymentRepository.upsertMembershipFromSubscription).not.toHaveBeenCalled();
  });
});

/**
 * Plan switching.
 *
 * The contract these lock down is the double-billing fix: a member who already
 * has a live Stripe subscription must never end up with a second one. The old
 * implementation called `subscriptions.create` unconditionally and marked the
 * previous membership row `canceled` locally, which left Stripe billing both
 * plans while the database claimed otherwise.
 */
describe('paymentService.createMembershipIntent — plan switching', () => {
  const USER = {
    id: PROFILE,
    email: 'ana@reyes.dev',
    role: 'member' as const,
    accessToken: 'token-1',
    isActiveMember: true,
  };

  const HIVE = {
    id: 'hive',
    name: 'Hive',
    price_monthly_cents: 37500,
    price_annual_cents: null,
    stripe_price_monthly: 'price_hive',
    stripe_price_annual: null,
    active: true,
  };

  /** A live subscription on Standard, with one item — what a switcher has. */
  function liveSubscription(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sub_existing',
      status: 'active',
      customer: 'cus_123',
      metadata: { profileId: PROFILE, planId: 'standard', period: 'month' },
      items: {
        data: [{ id: 'si_existing', price: { id: 'price_standard' } }],
      },
      ...overrides,
    } as unknown as Stripe.Subscription;
  }

  /** Everything the create-a-new-subscription path needs to reach its return. */
  function armCreateFlow() {
    vi.mocked(stripe.customers.list).mockResolvedValue({ data: [{ id: 'cus_123' }] } as never);
    vi.mocked(paymentRepository.create).mockResolvedValue({ id: 'pay_1' } as never);
    vi.mocked(stripe.subscriptions.create).mockResolvedValue({
      id: 'sub_new',
      latest_invoice: { confirmation_secret: { client_secret: 'cs_new' } },
      pending_setup_intent: null,
    } as never);
    vi.mocked(stripe.ephemeralKeys.create).mockResolvedValue({ secret: 'ek_1' } as never);
  }

  beforeEach(() => {
    vi.mocked(profileRepository.planById).mockResolvedValue(HIVE as never);
    vi.mocked(paymentRepository.findByIdempotencyKey).mockResolvedValue(null);
  });

  it('creates exactly one subscription for a member who has none', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue(null);
    armCreateFlow();

    const result = await paymentService.createMembershipIntent(USER, {
      planId: 'hive',
      period: 'month',
      idempotencyKey: 'key-1',
    });

    expect(stripe.subscriptions.create).toHaveBeenCalledOnce();
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(result.outcome).toBe('checkout');
  });

  it('UPDATES the existing subscription instead of creating a second one', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue({
      stripe_subscription_id: 'sub_existing',
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(liveSubscription() as never);
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({ id: 'sub_existing' } as never);

    const result = await paymentService.createMembershipIntent(USER, {
      planId: 'hive',
      period: 'month',
      idempotencyKey: 'key-2',
    });

    // The whole point: no second subscription, ever.
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.update).toHaveBeenCalledOnce();

    // Same subscription id in and out.
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_existing',
      expect.objectContaining({
        // Addressing the existing ITEM by id is what re-prices rather than adds.
        items: [{ id: 'si_existing', price: 'price_hive' }],
        proration_behavior: 'create_prorations',
      }),
      expect.objectContaining({ idempotencyKey: 'switch_key-2' }),
    );

    expect(result).toMatchObject({ outcome: 'switched', subscriptionId: 'sub_existing' });
  });

  it('rewrites the subscription metadata so the webhook syncs the NEW plan', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue({
      stripe_subscription_id: 'sub_existing',
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(liveSubscription() as never);
    vi.mocked(stripe.subscriptions.update).mockResolvedValue({ id: 'sub_existing' } as never);

    await paymentService.createMembershipIntent(USER, {
      planId: 'hive',
      period: 'month',
      idempotencyKey: 'key-3',
    });

    // `syncSubscription` reads planId from metadata before falling back to a
    // price lookup, so stale metadata would move the price and not the plan.
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_existing',
      expect.objectContaining({
        metadata: expect.objectContaining({ planId: 'hive', period: 'month', profileId: PROFILE }),
      }),
      expect.anything(),
    );
  });

  it('does nothing at all when the member already holds that plan', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue({
      stripe_subscription_id: 'sub_existing',
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      liveSubscription({
        items: { data: [{ id: 'si_existing', price: { id: 'price_hive' } }] },
      }) as never,
    );

    const result = await paymentService.createMembershipIntent(USER, {
      planId: 'hive',
      period: 'month',
      idempotencyKey: 'key-4',
    });

    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(result.outcome).toBe('unchanged');
  });

  it('does not touch local membership state when the Stripe update fails', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue({
      stripe_subscription_id: 'sub_existing',
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(liveSubscription() as never);
    vi.mocked(stripe.subscriptions.update).mockRejectedValue(new Error('card_declined'));

    await expect(
      paymentService.createMembershipIntent(USER, {
        planId: 'hive',
        period: 'month',
        idempotencyKey: 'key-5',
      }),
    ).rejects.toThrow('card_declined');

    // The member stays on the plan they were actually paying for.
    expect(paymentRepository.upsertMembershipFromSubscription).not.toHaveBeenCalled();
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it('starts a fresh subscription when Stripe has never heard of the recorded one', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue({
      stripe_subscription_id: 'sub_gone',
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        code: 'resource_missing',
        message: 'No such subscription',
      }),
    );
    armCreateFlow();

    const result = await paymentService.createMembershipIntent(USER, {
      planId: 'hive',
      period: 'month',
      idempotencyKey: 'key-6',
    });

    // Safe: there is demonstrably nothing on the other side still billing.
    expect(stripe.subscriptions.create).toHaveBeenCalledOnce();
    expect(result.outcome).toBe('checkout');
  });

  it('starts a fresh subscription when the existing one is already dead', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue({
      stripe_subscription_id: 'sub_existing',
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      liveSubscription({ status: 'canceled' }) as never,
    );
    armCreateFlow();

    await paymentService.createMembershipIntent(USER, {
      planId: 'hive',
      period: 'month',
      idempotencyKey: 'key-7',
    });

    expect(stripe.subscriptions.create).toHaveBeenCalledOnce();
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('refuses to guess which line to re-price on a multi-item subscription', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue({
      stripe_subscription_id: 'sub_existing',
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      liveSubscription({
        items: {
          data: [
            { id: 'si_a', price: { id: 'price_standard' } },
            { id: 'si_b', price: { id: 'price_addon' } },
          ],
        },
      }) as never,
    );

    await expect(
      paymentService.createMembershipIntent(USER, {
        planId: 'hive',
        period: 'month',
        idempotencyKey: 'key-8',
      }),
    ).rejects.toThrow(/more than one billing line/);

    // Neither path ran: no silent double charge, no half-applied change.
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });
});

/**
 * After a switch there is only ever ONE subscription id for the member, so the
 * events that follow cannot describe two memberships. These assert the property
 * that used to be violated.
 */
describe('membership state after a plan switch', () => {
  it('syncs the same subscription id onto one membership row', async () => {
    const switched = subscription({
      metadata: { profileId: PROFILE, planId: 'hive', period: 'month' },
      items: {
        data: [
          {
            current_period_end: 1_800_000_000,
            price: { id: 'price_hive', recurring: { interval: 'month' } },
          },
        ],
      },
    } as unknown as Partial<Stripe.Subscription>);

    await paymentService.syncSubscription(switched);

    // Upsert is keyed on stripe_subscription_id, and the id did not change, so
    // this lands on the row that already existed rather than adding a second.
    expect(paymentRepository.upsertMembershipFromSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSubscriptionId: 'sub_123', planId: 'hive' }),
    );
    expect(paymentRepository.upsertMembershipFromSubscription).toHaveBeenCalledOnce();
  });

  it('stays idempotent when the switch webhook is delivered twice', async () => {
    vi.mocked(paymentRepository.claimWebhookEvent)
      .mockResolvedValueOnce('claimed')
      .mockResolvedValueOnce('already_processed');

    const evt = event('customer.subscription.updated', subscription(), 'evt_switch');

    await paymentService.handleWebhook(evt);
    await paymentService.handleWebhook(evt);

    expect(paymentRepository.upsertMembershipFromSubscription).toHaveBeenCalledOnce();
  });
});

/**
 * Cancelling ahead of account deletion.
 *
 * The property under test is that billing is never left running behind a
 * deleted account, and never falsely reported as stopped.
 */
describe('paymentService.cancelSubscriptionForAccountDeletion', () => {
  const USER = {
    id: PROFILE,
    email: 'ana@reyes.dev',
    role: 'member' as const,
    accessToken: 'token-1',
    isActiveMember: true,
  };

  it('cancels a live subscription outright', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue({
      stripe_subscription_id: 'sub_live',
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: 'sub_live',
      status: 'active',
    } as never);

    const result = await paymentService.cancelSubscriptionForAccountDeletion(USER);

    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_live');
    expect(result).toEqual({ subscriptionId: 'sub_live', wasAlreadyInactive: false });
  });

  it('proceeds cleanly when there is no subscription at all', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue(null);

    const result = await paymentService.cancelSubscriptionForAccountDeletion(USER);

    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(result).toEqual({ subscriptionId: null, wasAlreadyInactive: true });
  });

  it('does not re-cancel a subscription Stripe already finished', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue({
      stripe_subscription_id: 'sub_done',
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: 'sub_done',
      status: 'canceled',
    } as never);

    const result = await paymentService.cancelSubscriptionForAccountDeletion(USER);

    // Cancelling an already-cancelled subscription is an error from Stripe,
    // which would abort a deletion that should have succeeded.
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(result.wasAlreadyInactive).toBe(true);
  });

  it('treats a subscription Stripe has never heard of as nothing to cancel', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue({
      stripe_subscription_id: 'sub_gone',
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        code: 'resource_missing',
        message: 'No such subscription',
      }),
    );

    const result = await paymentService.cancelSubscriptionForAccountDeletion(USER);

    expect(result.wasAlreadyInactive).toBe(true);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('propagates a genuine Stripe failure so the deletion aborts', async () => {
    vi.mocked(profileRepository.membership).mockResolvedValue({
      stripe_subscription_id: 'sub_live',
    } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: 'sub_live',
      status: 'active',
    } as never);
    vi.mocked(stripe.subscriptions.cancel).mockRejectedValue(new Error('Stripe unavailable'));

    await expect(paymentService.cancelSubscriptionForAccountDeletion(USER)).rejects.toThrow(
      'Stripe unavailable',
    );
  });
});

describe('paymentService.processWebhookEvent', () => {
  it('marks a membership past due when its invoice fails', async () => {
    await paymentService.processWebhookEvent(
      event('invoice.payment_failed', { subscription: 'sub_123' }),
    );

    expect(paymentRepository.updateMembershipBySubscription).toHaveBeenCalledWith('sub_123', {
      status: 'past_due',
    });
  });

  it('records a donation but never grants membership from a payment intent', async () => {
    vi.mocked(paymentRepository.markStatus).mockResolvedValue({
      id: 'pay_1',
    } as never);

    await paymentService.processWebhookEvent(
      event('payment_intent.succeeded', {
        id: 'pi_1',
        amount: 5000,
        amount_received: 5000,
        receipt_email: 'ana@reyes.dev',
        metadata: { kind: 'donation', paymentId: 'pay_1' },
      }),
    );

    expect(paymentRepository.recordDonation).toHaveBeenCalledOnce();
    expect(paymentRepository.upsertMembershipFromSubscription).not.toHaveBeenCalled();
  });

  it('does not grant a membership from a membership payment intent either', async () => {
    vi.mocked(paymentRepository.markStatus).mockResolvedValue({ id: 'pay_1' } as never);

    await paymentService.processWebhookEvent(
      event('payment_intent.succeeded', {
        id: 'pi_1',
        amount: 15000,
        metadata: { kind: 'membership', profileId: PROFILE, planId: 'standard' },
      }),
    );

    // `customer.subscription.*` is the sole authority; granting here too would
    // race it and could produce two membership rows for one checkout.
    expect(paymentRepository.upsertMembershipFromSubscription).not.toHaveBeenCalled();
  });
});
