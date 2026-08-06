import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationService, type PushMessage } from '../notification.service.js';
import { notificationRepository } from '../../repositories/notification.repository.js';

vi.mock('../../repositories/notification.repository.js', () => ({
  notificationRepository: {
    audienceFor: vi.fn(),
    claimDelivery: vi.fn(),
    markDelivery: vi.fn(),
    clearPushToken: vi.fn(),
    upcomingBookingsNeedingReminder: vi.fn(),
    membershipsExpiringWithin: vi.fn(),
  },
}));

vi.mock('../../config/env.js', () => ({
  env: { EXPO_ACCESS_TOKEN: 'test-expo-token' },
  isProduction: false,
  isTest: true,
}));

function message(overrides: Partial<PushMessage> = {}): PushMessage {
  return {
    profileId: '22222222-2222-4222-8222-222222222222',
    token: 'ExponentPushToken[abc]',
    title: 'Test',
    body: 'Body',
    channel: 'events',
    dedupeKey: 'test:1',
    ...overrides,
  };
}

/** Stand in for Expo's endpoint, returning one ticket per message sent. */
function mockExpo(tickets: Array<Record<string, unknown>>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: tickets }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(notificationRepository.claimDelivery).mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The push sender.
 *
 * Tokens were being stored and nothing ever sent to them: "Event announcements"
 * and "Weekly community digest" were switches wired to nothing. These tests
 * cover the three properties that make a fan-out safe — consent, exactly-once,
 * and bounded batches.
 */
describe('notificationService.send', () => {
  it('claims a delivery before sending, so a crash mid-batch is safe to retry', async () => {
    vi.stubGlobal('fetch', mockExpo([{ status: 'ok', id: 'ticket-1' }]));

    await notificationService.send([message()]);

    const claimOrder = vi.mocked(notificationRepository.claimDelivery).mock.invocationCallOrder[0];
    const sendOrder = vi.mocked(globalThis.fetch).mock.invocationCallOrder[0];

    expect(claimOrder).toBeLessThan(sendOrder as number);
  });

  it('skips a message whose dedupe key was already claimed', async () => {
    vi.mocked(notificationRepository.claimDelivery).mockResolvedValue(false);
    const fetchMock = mockExpo([]);
    vi.stubGlobal('fetch', fetchMock);

    const report = await notificationService.send([message()]);

    expect(report).toMatchObject({ requested: 1, skipped: 1, sent: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records each ticket against its own message', async () => {
    vi.stubGlobal(
      'fetch',
      mockExpo([
        { status: 'ok', id: 'ticket-1' },
        { status: 'error', message: 'bad token', details: { error: 'DeviceNotRegistered' } },
      ]),
    );

    const report = await notificationService.send([
      message({ dedupeKey: 'a' }),
      message({ dedupeKey: 'b', profileId: 'other' }),
    ]);

    expect(report).toMatchObject({ sent: 1, failed: 1 });
    expect(notificationRepository.markDelivery).toHaveBeenCalledWith(
      expect.any(String),
      'a',
      expect.objectContaining({ status: 'sent', ticketId: 'ticket-1' }),
    );
  });

  it('clears a token Expo says is dead, rather than retrying it forever', async () => {
    vi.stubGlobal(
      'fetch',
      mockExpo([{ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }]),
    );

    await notificationService.send([message()]);

    expect(notificationRepository.clearPushToken).toHaveBeenCalledWith(message().profileId);
  });

  it('keeps a token that failed for any other reason', async () => {
    vi.stubGlobal(
      'fetch',
      mockExpo([
        { status: 'error', message: 'rate limited', details: { error: 'MessageRateExceeded' } },
      ]),
    );

    await notificationService.send([message()]);

    expect(notificationRepository.clearPushToken).not.toHaveBeenCalled();
  });

  it('chunks the audience to Expo’s 100-message ceiling', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: Array.from({ length: 100 }, () => ({ status: 'ok' })) }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await notificationService.send(
      Array.from({ length: 250 }, (_, index) =>
        message({ dedupeKey: `k${index}`, profileId: `p${index}` }),
      ),
    );

    // 250 messages → 100 + 100 + 50.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('marks the whole batch failed when the request itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const report = await notificationService.send([message(), message({ dedupeKey: 'b' })]);

    expect(report).toMatchObject({ failed: 2, sent: 0 });
    expect(notificationRepository.markDelivery).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ status: 'failed', error: 'network down' }),
    );
  });

  it('does nothing at all for an empty audience', async () => {
    const fetchMock = mockExpo([]);
    vi.stubGlobal('fetch', fetchMock);

    const report = await notificationService.send([]);

    expect(report).toEqual({ requested: 0, sent: 0, skipped: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('audience filtering', () => {
  it('excludes anyone who turned the channel off', () => {
    const targets = [
      { profile_id: 'a', push_token: 't', events: true, bookings: false, weekly_digest: false },
      { profile_id: 'b', push_token: 't', events: false, bookings: true, weekly_digest: false },
    ];

    expect(notificationService.audienceOf(targets, 'events')).toHaveLength(1);
    expect(notificationService.audienceOf(targets, 'bookings')).toHaveLength(1);
    expect(notificationService.audienceOf(targets, 'weekly_digest')).toHaveLength(0);
  });
});

describe('notificationService.sendWeeklyDigest', () => {
  it('keys the dedupe on the ISO week, so a re-run does not resend', async () => {
    vi.mocked(notificationRepository.audienceFor).mockResolvedValue([
      { profile_id: 'a', push_token: 'tok', events: true, bookings: true, weekly_digest: true },
    ]);
    vi.stubGlobal('fetch', mockExpo([{ status: 'ok', id: 't1' }]));

    await notificationService.sendWeeklyDigest({ weekKey: '2026-W32', eventCount: 4 });

    expect(notificationRepository.claimDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: 'digest:2026-W32' }),
    );
  });
});
