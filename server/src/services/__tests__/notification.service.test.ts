import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationService, type PushMessage } from '../notification.service.js';
import { notificationRepository } from '../../repositories/notification.repository.js';
import type { PushTargetRow } from '../../types/database.js';

vi.mock('../../repositories/notification.repository.js', () => ({
  notificationRepository: {
    audiencePages: vi.fn(),
    emailAudiencePages: vi.fn(),
    claimDelivery: vi.fn(),
    markDelivery: vi.fn(),
    clearPushToken: vi.fn(),
    bookingReminderPages: vi.fn(),
    membershipReminderPages: vi.fn(),
    staffPushTargets: vi.fn(),
  },
}));

/*
 * `sendTourReminders` reaches these two, and both import the Supabase client at
 * module scope. Without a stub the import alone constructs a real client from a
 * mocked env that has no project URL, and the whole file fails to load before a
 * single test runs.
 */
vi.mock('../../repositories/content.repository.js', () => ({
  contentRepository: { confirmedToursBetween: vi.fn() },
}));

vi.mock('../../repositories/profile.repository.js', () => ({
  profileRepository: { findById: vi.fn() },
}));

/** Turn fixed pages into the async generator the service now consumes. */
function pagesOf<T>(...pages: T[][]) {
  return async function* generate(): AsyncGenerator<T[], void, undefined> {
    for (const page of pages) yield page;
  };
}

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
    vi.mocked(notificationRepository.audiencePages).mockImplementation(
      pagesOf([
        { profile_id: 'a', push_token: 'tok', events: true, bookings: true, weekly_digest: true },
      ]),
    );
    vi.stubGlobal('fetch', mockExpo([{ status: 'ok', id: 't1' }]));

    await notificationService.sendWeeklyDigest({ weekKey: '2026-W32', eventCount: 4 });

    expect(notificationRepository.claimDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: 'digest:2026-W32' }),
    );
  });
});

/**
 * The routing contract.
 *
 * Every producer must emit `href`, because that is the ONLY key the app reads
 * (`mobile/src/services/notificationRoute.ts`). These previously all sent
 * `route`, so a notification arrived, rendered, was tapped — and navigated
 * nowhere, with nothing logged at either end. The assertions are on the payload
 * that actually reaches Expo, which is the thing the device receives.
 */
describe('push payload routing contract', () => {
  /** The `data` object handed to Expo for the first message of a send. */
  async function payloadFrom(send: () => Promise<unknown>): Promise<Record<string, unknown>> {
    const fetchMock = mockExpo([{ status: 'ok', id: 'ticket-1' }]);
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(notificationRepository.claimDelivery).mockResolvedValue(true);

    await send();

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body) as Array<{
      data?: Record<string, unknown>;
    }>;

    return body[0]?.data ?? {};
  }

  const target = {
    profile_id: '22222222-2222-4222-8222-222222222222',
    push_token: 'ExponentPushToken[abc]',
  };

  it('booking reminders route to the booking tab', async () => {
    vi.mocked(notificationRepository.bookingReminderPages).mockImplementation(
      pagesOf([
        {
          booking_id: 'b1',
          profile_id: target.profile_id,
          push_token: target.push_token,
          resource_name: 'Glowforge',
          starts_at: '2026-09-01T17:00:00Z',
          ends_at: '2026-09-01T18:00:00Z',
        },
      ]),
    );

    const data = await payloadFrom(() => notificationService.sendBookingReminders(15));

    expect(data).toEqual({ href: '/(app)/(tabs)/book' });
    expect(data).not.toHaveProperty('route');
  });

  it('event announcements route to that specific event', async () => {
    vi.mocked(notificationRepository.audiencePages).mockImplementation(
      pagesOf([{ ...target, events: true, bookings: true, weekly_digest: true }]),
    );

    const data = await payloadFrom(() =>
      notificationService.announceEvent({
        eventId: 'e-123',
        title: 'Rust After Dark',
        startsAt: '2026-09-01T17:00:00Z',
        endsAt: '2026-09-01T19:00:00Z',
        roomName: 'Large Conference',
      }),
    );

    expect(data).toEqual({ href: '/(app)/event/e-123' });
  });

  it('the weekly digest routes to the events tab', async () => {
    vi.mocked(notificationRepository.audiencePages).mockImplementation(
      pagesOf([{ ...target, events: true, bookings: true, weekly_digest: true }]),
    );

    const data = await payloadFrom(() =>
      notificationService.sendWeeklyDigest({ weekKey: '2026-W36', eventCount: 3 }),
    );

    expect(data).toEqual({ href: '/(app)/(tabs)/events' });
  });

  it('membership reminders route to settings', async () => {
    vi.mocked(notificationRepository.membershipReminderPages).mockImplementation(
      pagesOf([
        {
          membership_id: 'm1',
          profile_id: target.profile_id,
          push_token: target.push_token,
          current_period_end: '2026-09-10T00:00:00Z',
          cancel_at_period_end: false,
        },
      ]),
    );

    const data = await payloadFrom(() => notificationService.sendMembershipReminders(3));

    expect(data).toEqual({ href: '/(app)/settings' });
  });

  it('every producer uses the canonical key and only that key', async () => {
    vi.mocked(notificationRepository.audiencePages).mockImplementation(
      pagesOf([{ ...target, events: true, bookings: true, weekly_digest: true }]),
    );

    const data = await payloadFrom(() =>
      notificationService.sendWeeklyDigest({ weekKey: '2026-W37', eventCount: 0 }),
    );

    expect(Object.keys(data)).toEqual(['href']);
  });
});

/**
 * The audience is no longer truncated at 200.
 *
 * PostgREST is configured with `max_rows = 200`, and every audience query was a
 * single unordered `select` with no limit — so it came back holding 200
 * arbitrary rows and reported success. Member 201 onwards never received a
 * digest, an announcement or a reminder: nothing logged, nothing failed, and no
 * counter disagreed, because the audience was simply smaller than the
 * membership and nothing knew it.
 *
 * These drive the service with a REAL multi-page generator and count what came
 * out the other end.
 */
describe('audience pagination', () => {
  /** `count` recipients, split into pages of 100 as the repository does. */
  function audienceOfSize(count: number) {
    const pages: PushTargetRow[][] = [];
    for (let index = 0; index < count; index += 100) {
      pages.push(
        Array.from({ length: Math.min(100, count - index) }, (_, offset) => ({
          profile_id: `profile-${String(index + offset).padStart(4, '0')}`,
          push_token: `ExponentPushToken[${index + offset}]`,
          events: true,
          bookings: true,
          weekly_digest: true,
        })) as PushTargetRow[],
      );
    }
    return pages;
  }

  /** Every token Expo was actually asked to deliver to, across all requests. */
  function tokensSentTo(fetchMock: ReturnType<typeof vi.fn>): string[] {
    return fetchMock.mock.calls.flatMap((call) => {
      const body = JSON.parse((call[1] as { body: string }).body) as Array<{ to: string }>;
      return body.map((message) => message.to);
    });
  }

  function armExpo(pages: PushTargetRow[][]) {
    const total = pages.reduce((sum, page) => sum + page.length, 0);
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const batch = JSON.parse(init.body) as unknown[];
      return {
        ok: true,
        json: async () => ({ data: batch.map(() => ({ status: 'ok', id: 'ticket' })) }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(notificationRepository.claimDelivery).mockResolvedValue(true);
    vi.mocked(notificationRepository.audiencePages).mockImplementation(pagesOf(...pages));
    return { fetchMock, total };
  }

  it.each([0, 1, 199, 200, 201, 500])('reaches exactly %i recipients', async (size) => {
    const pages = audienceOfSize(size);
    const { fetchMock } = armExpo(pages);

    const report = await notificationService.sendWeeklyDigest({
      weekKey: '2026-W37',
      eventCount: 3,
    });

    // The number that used to stop at 200.
    expect(report.requested).toBe(size);
    expect(report.sent).toBe(size);
    expect(tokensSentTo(fetchMock)).toHaveLength(size);
  });

  it('never sends to the same recipient twice across pages', async () => {
    const { fetchMock } = armExpo(audienceOfSize(500));

    await notificationService.sendWeeklyDigest({ weekKey: '2026-W37', eventCount: 1 });

    const tokens = tokensSentTo(fetchMock);
    expect(new Set(tokens).size).toBe(500);
  });

  it('skips nobody between pages', async () => {
    const pages = audienceOfSize(250);
    const { fetchMock } = armExpo(pages);

    await notificationService.sendWeeklyDigest({ weekKey: '2026-W37', eventCount: 1 });

    const expected = pages
      .flat()
      .map((target) => target.push_token)
      .sort();
    expect(tokensSentTo(fetchMock).sort()).toEqual(expected);
  });

  it('keeps every Expo request within the 100-message batch limit', async () => {
    const { fetchMock } = armExpo(audienceOfSize(500));

    await notificationService.sendWeeklyDigest({ weekKey: '2026-W37', eventCount: 1 });

    for (const call of fetchMock.mock.calls) {
      const batch = JSON.parse((call[1] as { body: string }).body) as unknown[];
      expect(batch.length).toBeLessThanOrEqual(100);
    }
  });

  it('still deduplicates: a recipient already claimed is skipped, not resent', async () => {
    const { fetchMock } = armExpo(audienceOfSize(201));
    // Every other recipient has already been sent this exact digest.
    let call = 0;
    vi.mocked(notificationRepository.claimDelivery).mockImplementation(async () => {
      call += 1;
      return call % 2 === 1;
    });

    const report = await notificationService.sendWeeklyDigest({
      weekKey: '2026-W37',
      eventCount: 1,
    });

    expect(report.requested).toBe(201);
    expect(report.skipped).toBe(100);
    expect(report.sent).toBe(101);
    expect(tokensSentTo(fetchMock)).toHaveLength(101);
  });

  it('records a failed page as failed without losing the pages that worked', async () => {
    const pages = audienceOfSize(300);
    const { fetchMock } = armExpo(pages);
    // The middle page's Expo request fails outright.
    let request = 0;
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      request += 1;
      if (request === 2) throw new Error('Expo unavailable');
      const batch = JSON.parse(init.body) as unknown[];
      return {
        ok: true,
        json: async () => ({ data: batch.map(() => ({ status: 'ok', id: 'ticket' })) }),
      };
    });

    const report = await notificationService.sendWeeklyDigest({
      weekKey: '2026-W37',
      eventCount: 1,
    });

    // Successful pages stay successful; only the failed one is counted failed.
    expect(report.requested).toBe(300);
    expect(report.sent).toBe(200);
    expect(report.failed).toBe(100);
    // And those 100 are recorded so a retry can find them.
    expect(notificationRepository.markDelivery).toHaveBeenCalled();
  });

  it('applies to booking reminders too', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => ({
      booking_id: `booking-${index}`,
      profile_id: `profile-${index}`,
      push_token: `ExponentPushToken[${index}]`,
      resource_name: 'Glowforge',
      starts_at: '2026-09-01T17:00:00Z',
      ends_at: '2026-09-01T18:00:00Z',
    }));
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const batch = JSON.parse(init.body) as unknown[];
      return {
        ok: true,
        json: async () => ({ data: batch.map(() => ({ status: 'ok', id: 'ticket' })) }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(notificationRepository.claimDelivery).mockResolvedValue(true);
    vi.mocked(notificationRepository.bookingReminderPages).mockImplementation(
      pagesOf(rows.slice(0, 100), rows.slice(100, 200), rows.slice(200)),
    );

    const report = await notificationService.sendBookingReminders(15);

    expect(report.sent).toBe(201);
  });

  it('applies to membership reminders too', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => ({
      membership_id: `m-${index}`,
      profile_id: `profile-${index}`,
      push_token: `ExponentPushToken[${index}]`,
      current_period_end: '2026-09-10T00:00:00Z',
      cancel_at_period_end: false,
    }));
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const batch = JSON.parse(init.body) as unknown[];
      return {
        ok: true,
        json: async () => ({ data: batch.map(() => ({ status: 'ok', id: 'ticket' })) }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(notificationRepository.claimDelivery).mockResolvedValue(true);
    vi.mocked(notificationRepository.membershipReminderPages).mockImplementation(
      pagesOf(rows.slice(0, 100), rows.slice(100, 200), rows.slice(200)),
    );

    const report = await notificationService.sendMembershipReminders(3);

    expect(report.sent).toBe(201);
  });
});
