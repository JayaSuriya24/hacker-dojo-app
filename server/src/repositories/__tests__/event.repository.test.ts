import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `event_feed` is a `security_invoker` view, so the service-role client used to
 * serve signed-out visitors bypasses RLS entirely. Every guarantee the policies
 * express — published only, and not members-only — has to be restated in the
 * query for that one path, and a missing restatement is invisible until someone
 * marks an event members-only.
 */
const h = vi.hoisted(() => {
  const filters: Array<{ client: string; column: string; value: unknown }> = [];
  const selects: Array<{ client: string; options: Record<string, unknown> }> = [];
  const tables: string[] = [];
  /** Every payload handed to `.insert()`, so a dropped column is visible. */
  const inserts: Array<Record<string, unknown>> = [];

  const makeClient = (name: string) => {
    const builder: Record<string, unknown> = {
      select: (_columns?: string, options?: Record<string, unknown>) => {
        if (options) selects.push({ client: name, options });
        return builder;
      },
      order: () => builder,
      range: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push({ client: name, column, value });
        return builder;
      },
      insert: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return builder;
      },
      gte: (column: string, value: unknown) => {
        filters.push({ client: name, column: `gte:${column}`, value });
        return builder;
      },
      lt: (column: string, value: unknown) => {
        filters.push({ client: name, column: `lt:${column}`, value });
        return builder;
      },
      maybeSingle: async () => ({ data: null, error: null }),
      // `unwrap` refuses null, so the insert path needs a row back.
      single: async () => ({ data: { reference: 'REQ-TEST' }, error: null }),
      returns: async () => ({ data: [], error: null }),
      // A head-count query is awaited directly, with no row accessor.
      then: (resolve: (value: unknown) => unknown) => resolve({ count: 3, error: null }),
    };
    return {
      from: (table: string) => {
        tables.push(table);
        return builder;
      },
    };
  };

  return { filters, inserts, selects, tables, makeClient };
});

vi.mock('../../config/supabase.js', () => ({
  adminClient: h.makeClient('admin'),
  userClient: () => h.makeClient('user'),
}));

const { eventRepository } = await import('../event.repository.js');
const { hostEventSchema } = await import('../../validators/index.js');

const membersOnlyFilter = () =>
  h.filters.find((f) => f.column === 'members_only' && f.value === false);

beforeEach(() => {
  h.filters.length = 0;
  h.inserts.length = 0;
  h.selects.length = 0;
  h.tables.length = 0;
});

describe('eventRepository.findById', () => {
  it('hides members-only events from a signed-out caller', async () => {
    await eventRepository.findById(null, 'some-id');

    // The leak this guards: the feed excluded members-only events while the
    // detail endpoint served them in full to anyone who asked for one by id.
    expect(membersOnlyFilter()).toBeDefined();
  });

  it('leaves a signed-in caller to RLS rather than filtering in the query', async () => {
    await eventRepository.findById('token', 'some-id');

    // A member is entitled to members-only events; the policies decide, and a
    // blanket filter here would hide them from the people they are for.
    expect(membersOnlyFilter()).toBeUndefined();
  });
});

describe('eventRepository.list', () => {
  it('hides members-only events from a signed-out caller', async () => {
    await eventRepository.list(null, { limit: 20, offset: 0 });

    expect(membersOnlyFilter()).toBeDefined();
  });

  it('leaves a signed-in caller to RLS', async () => {
    await eventRepository.list('token', { limit: 20, offset: 0 });

    expect(membersOnlyFilter()).toBeUndefined();
  });
});

/**
 * Recurrence must survive the trip to the database.
 *
 * The bug: `hostEventSchema` validated the host's time, duration and repeat
 * rule, the controller passed the whole body through — and `createRequest`'s
 * `.insert()` mapped seven columns and silently dropped all six scheduling
 * ones. Every request therefore landed on the column DEFAULTS
 * (`preferred_time '18:00'`, `duration_minutes 120`, `repeat_mode 'once'`), so
 * "every Saturday at 10:00 for three hours" was stored as a one-off at 6pm for
 * two hours, and `eventApprovalService` — which branches on `repeat_mode` —
 * could never take the weekly branch. The `event_series` machinery was
 * unreachable from the product.
 *
 * These assert on the payload actually handed to `.insert()`, which is the
 * layer that dropped them.
 */
describe('eventRepository.createRequest — recurrence is persisted', () => {
  const base = {
    profileId: '22222222-2222-4222-8222-222222222222',
    title: 'Rust After Dark',
    category: 'Workshops' as const,
    expectedSize: 30,
    preferredDate: '2026-09-05',
    preferredRoom: 'Large Conference',
    preferredTime: '10:00',
    durationMinutes: 180,
    repeatMode: 'weekly' as const,
    repeatWeekdays: [6],
    repeatIntervalWeeks: 2,
    repeatUntil: '2026-12-19',
  };

  it('sends the recurrence rule to the database', async () => {
    await eventRepository.createRequest('token', base);

    expect(h.inserts[0]).toMatchObject({
      repeat_mode: 'weekly',
      repeat_weekdays: [6],
      repeat_interval_weeks: 2,
    });
  });

  it('sends the recurrence end date to the database', async () => {
    await eventRepository.createRequest('token', base);

    expect(h.inserts[0]).toMatchObject({ repeat_until: '2026-12-19' });
  });

  it('sends the wall clock the host asked for, not the column default', async () => {
    await eventRepository.createRequest('token', base);

    // '18:00'/120 are the migration defaults — reading them back here would
    // mean the host's answer was discarded again.
    expect(h.inserts[0]).toMatchObject({ preferred_time: '10:00', duration_minutes: 180 });
    expect(h.inserts[0]).not.toMatchObject({ preferred_time: '18:00' });
  });

  it('writes an open-ended series as a null end date rather than omitting it', async () => {
    const { repeatUntil, ...openEnded } = base;
    void repeatUntil;

    await eventRepository.createRequest('token', openEnded);

    // Explicitly null, so "no end date" is stated rather than defaulted.
    expect(h.inserts[0]).toHaveProperty('repeat_until', null);
  });

  it('still writes a one-off correctly', async () => {
    await eventRepository.createRequest('token', {
      ...base,
      repeatMode: 'once',
      repeatWeekdays: [],
      repeatIntervalWeeks: 1,
    });

    expect(h.inserts[0]).toMatchObject({
      repeat_mode: 'once',
      repeat_weekdays: [],
      repeat_interval_weeks: 1,
    });
  });

  it('carries every column the approval path later reads', async () => {
    await eventRepository.createRequest('token', base);

    // `eventApprovalService.fulfil` reads exactly these off the stored row.
    for (const column of [
      'preferred_time',
      'duration_minutes',
      'repeat_mode',
      'repeat_weekdays',
      'repeat_interval_weeks',
      'repeat_until',
    ]) {
      expect(h.inserts[0]).toHaveProperty(column);
    }
  });
});

/**
 * The validator is the other half: a rule that reaches the database has to be
 * one the database can expand. These are the cases the schema must keep
 * refusing, independently of the mapping above.
 */
describe('hostEventSchema — invalid recurrence is still rejected', () => {
  it('refuses a weekly request with no weekdays', () => {
    const result = hostEventSchema.safeParse({
      title: 'Weekly thing',
      category: 'Meetups',
      preferredDate: '2026-09-05',
      preferredRoom: 'Event Hall',
      repeatMode: 'weekly',
      repeatWeekdays: [],
    });

    // It would expand to no dates at all — an approved request with an empty
    // calendar behind it.
    expect(result.success).toBe(false);
  });

  it('refuses an end date before the first date', () => {
    const result = hostEventSchema.safeParse({
      title: 'Backwards',
      category: 'Meetups',
      preferredDate: '2026-09-05',
      preferredRoom: 'Event Hall',
      repeatMode: 'weekly',
      repeatWeekdays: [1],
      repeatUntil: '2026-08-01',
    });

    expect(result.success).toBe(false);
  });

  it('refuses a weekday outside the Postgres dow range', () => {
    const result = hostEventSchema.safeParse({
      title: 'Bad day',
      category: 'Meetups',
      preferredDate: '2026-09-05',
      preferredRoom: 'Event Hall',
      repeatMode: 'weekly',
      repeatWeekdays: [7],
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid weekly rule and applies the documented defaults', () => {
    const result = hostEventSchema.safeParse({
      title: 'Saturday Build',
      category: 'Workshops',
      preferredDate: '2026-09-05',
      preferredRoom: 'Event Hall',
      repeatMode: 'weekly',
      repeatWeekdays: [6],
      preferredTime: '10:00',
      durationMinutes: 180,
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ repeatIntervalWeeks: 1, expectedSize: 30 });
  });
});

/**
 * The weekly digest's event count.
 *
 * What it must count is "what a member sees on the Events tab for this week",
 * and the risks are counting things they cannot see (drafts, cancelled dates,
 * members-only events) or counting the wrong shape (a recurring series once
 * instead of its eight dates).
 */
describe('eventRepository.countPublishedBetween', () => {
  const FROM = '2026-09-07T07:00:00.000Z';
  const TO = '2026-09-14T07:00:00.000Z';

  it('counts in the database rather than paging rows into memory', async () => {
    await eventRepository.countPublishedBetween(FROM, TO);

    // `head: true` returns the count and NO rows, so nothing is loaded and the
    // `max_rows` ceiling on returned rows never applies.
    expect(h.selects[0]?.options).toMatchObject({ count: 'exact', head: true });
  });

  it('reads the same view the Events tab renders', async () => {
    await eventRepository.countPublishedBetween(FROM, TO);

    // `event_feed` already filters `status = 'published'`, so drafts,
    // pending_review submissions and CANCELLED dates are excluded by the same
    // rule that hides them from the tab.
    expect(h.tables).toContain('event_feed');
  });

  it('excludes events the recipient could not see', async () => {
    await eventRepository.countPublishedBetween(FROM, TO);

    // Service role bypasses RLS, so members-only has to be restated.
    expect(h.filters).toContainEqual({
      client: 'admin',
      column: 'members_only',
      value: false,
    });
  });

  it('bounds the window half-open, so no event is counted in two weeks', async () => {
    await eventRepository.countPublishedBetween(FROM, TO);

    expect(h.filters).toContainEqual({ client: 'admin', column: 'gte:starts_at', value: FROM });
    // `lt`, not `lte`: midnight on the closing Monday belongs to the next week.
    expect(h.filters).toContainEqual({ client: 'admin', column: 'lt:starts_at', value: TO });
  });

  it('returns the count the database reported', async () => {
    // Recurring occurrences are ordinary rows in `events`, so eight Saturdays
    // count as eight — which is what the member scrolls through.
    await expect(eventRepository.countPublishedBetween(FROM, TO)).resolves.toBe(3);
  });
});
