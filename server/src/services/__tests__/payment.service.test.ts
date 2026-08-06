import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { paymentService } from '../payment.service.js';
import { paymentRepository } from '../../repositories/payment.repository.js';

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
  stripe: {
    subscriptions: { retrieve: vi.fn() },
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
