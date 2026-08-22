import { adminClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { unwrapList } from '../utils/postgrest.js';
import type { PushDeliveryStatus, PushTargetRow } from '../types/database.js';

export interface BookingReminderRow {
  booking_id: string;
  profile_id: string;
  push_token: string;
  resource_name: string;
  starts_at: string;
  ends_at: string;
}

export interface MembershipReminderRow {
  membership_id: string;
  profile_id: string;
  push_token: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

/**
 * How many recipients are read, and processed, at a time.
 *
 * 100 rather than a round 200, for two reasons that happen to agree:
 *
 *   · PostgREST is configured with `max_rows = 200` (`supabase/config.toml`).
 *     A page asking for 200 would come back holding exactly 200 whether that is
 *     the whole answer or a server-side truncation of it — indistinguishable.
 *     Staying well under the ceiling means a short page is only ever short
 *     because the data ran out.
 *   · It is exactly Expo's per-request message limit, so one page of push
 *     recipients is one Expo request and no page has to be re-chunked.
 */
const AUDIENCE_PAGE_SIZE = 100;

/**
 * A ceiling on pages, so a cursor that somehow stopped advancing could not spin
 * forever. At 100 a page that is a million recipients — far past anything real,
 * which is what makes crossing it a bug worth logging rather than a limit worth
 * tuning.
 */
const MAX_AUDIENCE_PAGES = 10_000;

/**
 * Walk a query in bounded pages, keyed on a stable unique column.
 *
 * KEYSET pagination, not `range()`/OFFSET. The audience is live data — a member
 * can register a token, switch a preference off, or delete their account while
 * a digest is going out — and each of those shifts the offsets under a paging
 * query, which silently skips or repeats recipients. A cursor on a primary key
 * cannot: every page asks for "the rows after this exact id".
 *
 * Termination is an EMPTY READ, deliberately not a short one. A short page is
 * ambiguous (the data ran out, or PostgREST truncated at `max_rows`) and
 * stopping on it is how a paginated query silently truncates all over again.
 * One extra round trip removes the doubt.
 *
 * `select` runs AFTER the cursor advances, so a filter that empties an entire
 * page — everyone on it opted out — narrows that page without ending the walk.
 */
async function* pagesByKey<TRow, TOut>(
  label: string,
  keyOf: (row: TRow) => string,
  fetchPage: (cursor: string | null, size: number) => Promise<TRow[]>,
  select: (rows: TRow[]) => Promise<TOut[]>,
): AsyncGenerator<TOut[], void, undefined> {
  let cursor: string | null = null;

  for (let page = 0; page < MAX_AUDIENCE_PAGES; page += 1) {
    const rows = await fetchPage(cursor, AUDIENCE_PAGE_SIZE);
    if (rows.length === 0) return;

    const last = rows[rows.length - 1];
    if (last === undefined) return;
    cursor = keyOf(last);

    const selected = await select(rows);
    if (selected.length > 0) yield selected;
  }

  logger.error(
    { label, pages: MAX_AUDIENCE_PAGES },
    'Audience pagination hit its page ceiling — recipients may have been missed',
  );
}

/** Split ids into chunks small enough for an `in (...)` filter to return in full. */
function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += AUDIENCE_PAGE_SIZE) {
    chunks.push(ids.slice(index, index + AUDIENCE_PAGE_SIZE));
  }
  return chunks;
}

/** One person an announcement email can reach. */
export interface EmailRecipient {
  id: string;
  email: string;
  full_name: string;
}

interface PreferenceRow {
  profile_id: string;
  push_token: string | null;
  bookings: boolean;
}

/**
 * Notification preferences for a set of profiles, keyed by profile id.
 *
 * Fetched on their own rather than embedded in the query that needs them.
 * `bookings`, `memberships` and `notification_preferences` all reference
 * `profiles`, but none of them reference each other, so there is no path for
 * PostgREST to embed one from another. Asking for it anyway — as
 * `notification_preferences:profile_id(push_token, …)` — resolved the embed
 * against `profiles` via the `profile_id` foreign key and failed every run with
 * "column profiles_1.push_token does not exist", which meant no booking or
 * membership reminder was ever sent. A second round trip once a minute is the
 * price of a relationship the schema does not have.
 */
async function preferencesByProfile(profileIds: string[]): Promise<Map<string, PreferenceRow>> {
  const unique = [...new Set(profileIds)];
  if (unique.length === 0) return new Map();

  // `in (...)` is subject to the same `max_rows` ceiling as any other read, so a
  // set of ids larger than a page would come back only partially matched — and
  // a member whose preference row went missing that way is silently skipped.
  const rows: PreferenceRow[] = [];

  for (const chunk of chunkIds(unique)) {
    rows.push(
      ...unwrapList(
        await adminClient
          .from('notification_preferences')
          .select('profile_id, push_token, bookings')
          .in('profile_id', chunk)
          .returns<PreferenceRow[]>(),
        'Could not load notification preferences.',
      ),
    );
  }

  return new Map(rows.map((row) => [row.profile_id, row]));
}

/**
 * Push delivery state.
 *
 * Service role throughout: the sender is a background job with no caller, and
 * `push_deliveries` has no insert policy so nothing can forge a "we already
 * told them" row to suppress a notification.
 */
export const notificationRepository = {
  /**
   * Everyone who opted into a channel and has a live token.
   *
   * Consent is a WHERE clause rather than a filter applied after fetching, so a
   * member who turned a channel off is never loaded into memory as a candidate
   * in the first place.
   */
  /**
   * Everyone who should be emailed about a new event.
   *
   * Deliberately an OPT-OUT, which is the opposite of `audiencePages` below and
   * is the whole reason this is a separate query. That one starts from
   * `notification_preferences` and keeps rows where the channel is true — fine
   * for push, where a row only exists once a device has registered a token.
   * Email has no such prerequisite: every profile has an address from the day
   * it is created, and preference rows are NOT written on signup. Filtering the
   * same way would silently skip anyone who has never opened the settings
   * screen, which today is one profile in four.
   *
   * So: start from profiles, and remove only those who explicitly turned event
   * mail off. Never having expressed a preference is not the same as declining.
   */
  async *emailAudiencePages(): AsyncGenerator<EmailRecipient[], void, undefined> {
    /*
     * Both halves of this truncated at `max_rows`, and the opt-OUT half was the
     * more damaging: a partial list of people who declined event mail means
     * some of them are mailed anyway. So the exclusion is resolved per page,
     * against just that page's ids — two queries per page, never per recipient,
     * and nothing unbounded held in memory.
     */
    yield* pagesByKey<EmailRecipient, EmailRecipient>(
      'audience:event-email',
      (row) => row.id,
      async (cursor, size) => {
        let query = adminClient
          .from('profiles')
          .select('id, email, full_name')
          .order('id', { ascending: true })
          .limit(size);

        if (cursor) query = query.gt('id', cursor);

        return unwrapList(
          await query.returns<EmailRecipient[]>(),
          'Could not load the announcement audience.',
        );
      },
      async (profiles) => {
        const declined = unwrapList(
          await adminClient
            .from('notification_preferences')
            .select('profile_id')
            .eq('events', false)
            .in(
              'profile_id',
              profiles.map((profile) => profile.id),
            )
            .returns<Array<{ profile_id: string }>>(),
          'Could not load notification preferences.',
        );

        const optedOut = new Set(declined.map((row) => row.profile_id));

        return profiles.filter((profile) => Boolean(profile.email) && !optedOut.has(profile.id));
      },
    );
  },

  /**
   * Everyone who opted into a channel and holds a live token, in pages.
   *
   * This was a single unordered `select` with no limit, which is exactly why it
   * truncated: PostgREST caps every response at `max_rows` (200), so it
   * returned 200 arbitrary rows and reported success. Member 201 onwards never
   * received a digest or an announcement — nothing logged, nothing failed, and
   * no counter disagreed, because the audience was simply smaller than the
   * membership and nothing knew it.
   *
   * Ordered by `profile_id`, the PRIMARY KEY of `notification_preferences`, so
   * the cursor is unique and needs no tie-breaker.
   *
   * Consent stays a WHERE clause: a member who turned the channel off is never
   * loaded as a candidate in the first place.
   */
  async *audiencePages(
    channel: 'events' | 'bookings' | 'weekly_digest',
  ): AsyncGenerator<PushTargetRow[], void, undefined> {
    yield* pagesByKey<PushTargetRow, PushTargetRow>(
      `audience:${channel}`,
      (row) => row.profile_id,
      async (cursor, size) => {
        let query = adminClient
          .from('notification_preferences')
          .select('profile_id, push_token, events, bookings, weekly_digest')
          .not('push_token', 'is', null)
          .eq(channel, true)
          .order('profile_id', { ascending: true })
          .limit(size);

        if (cursor) query = query.gt('profile_id', cursor);

        return unwrapList(
          await query.returns<PushTargetRow[]>(),
          'Could not load the notification audience.',
        );
      },
      async (rows) => rows,
    );
  },

  /**
   * Reserve a delivery.
   *
   * Returns false when this exact notification was already claimed, which the
   * unique index on `(profile_id, dedupe_key)` decides. Claiming before the
   * send — rather than recording after it — is what makes a crash mid-batch
   * safe to retry.
   */
  async claimDelivery(input: {
    profileId: string;
    dedupeKey: string;
    channel: string;
    title: string;
    body: string;
  }): Promise<boolean> {
    const { error } = await adminClient.from('push_deliveries').insert({
      profile_id: input.profileId,
      dedupe_key: input.dedupeKey,
      channel: input.channel,
      title: input.title,
      body: input.body,
    });

    if (!error) return true;
    if (error.code === '23505') return false;
    throw new Error(error.message);
  },

  async markDelivery(
    profileId: string,
    dedupeKey: string,
    outcome: { status: PushDeliveryStatus; ticketId?: string | null; error?: string | null },
  ): Promise<void> {
    const { error } = await adminClient
      .from('push_deliveries')
      .update({
        status: outcome.status,
        ticket_id: outcome.ticketId ?? null,
        error: outcome.error?.slice(0, 500) ?? null,
      })
      .eq('profile_id', profileId)
      .eq('dedupe_key', dedupeKey);

    if (error) throw new Error(error.message);
  },

  /** Expo told us this device is gone; keeping the token would retry it forever. */
  async clearPushToken(profileId: string): Promise<void> {
    const { error } = await adminClient
      .from('notification_preferences')
      .update({ push_token: null, push_token_at: null })
      .eq('profile_id', profileId);

    if (error) throw new Error(error.message);
  },

  /**
   * Confirmed bookings starting inside the window, for members who want
   * reminders and have a token.
   *
   * The dedupe key upstream is the booking id, so a booking whose reminder
   * already went out is filtered by the unique index rather than by a
   * `reminded_at` column — one less piece of state to keep correct.
   */
  async *bookingReminderPages(
    withinMinutes: number,
  ): AsyncGenerator<BookingReminderRow[], void, undefined> {
    const now = new Date();
    const horizon = new Date(now.getTime() + withinMinutes * 60_000);

    type BookingRow = {
      id: string;
      profile_id: string;
      starts_at: string;
      ends_at: string;
      resources: { name: string } | null;
    };

    yield* pagesByKey<BookingRow, BookingReminderRow>(
      'reminders:bookings',
      // `id` is the primary key: unique, so the cursor cannot straddle rows.
      (row) => row.id,
      async (cursor, size) => {
        let query = adminClient
          .from('bookings')
          .select('id, profile_id, starts_at, ends_at, resources(name)')
          .eq('status', 'confirmed')
          .gte('starts_at', now.toISOString())
          .lte('starts_at', horizon.toISOString())
          .order('id', { ascending: true })
          .limit(size);

        if (cursor) query = query.gt('id', cursor);

        return unwrapList(
          await query.returns<BookingRow[]>(),
          'Could not load bookings needing a reminder.',
        );
      },
      // Consent and a live token are both still required — the rule is
      // unchanged, it just runs after the cursor has moved so a page of
      // non-consenting members narrows to nothing without ending the walk.
      async (rows) => {
        const preferences = await preferencesByProfile(rows.map((row) => row.profile_id));

        return rows.flatMap((row) => {
          const preference = preferences.get(row.profile_id);
          if (!preference?.bookings || !preference.push_token) return [];

          return [
            {
              booking_id: row.id,
              profile_id: row.profile_id,
              push_token: preference.push_token,
              resource_name: row.resources?.name ?? 'Your reservation',
              starts_at: row.starts_at,
              ends_at: row.ends_at,
            },
          ];
        });
      },
    );
  },

  /** Memberships whose period ends inside the window, for members with a token. */
  async *membershipReminderPages(
    daysAhead: number,
  ): AsyncGenerator<MembershipReminderRow[], void, undefined> {
    const now = new Date();
    const horizon = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    type MembershipRow = {
      id: string;
      profile_id: string;
      current_period_end: string;
      cancel_at_period_end: boolean;
    };

    yield* pagesByKey<MembershipRow, MembershipReminderRow>(
      'reminders:memberships',
      (row) => row.id,
      async (cursor, size) => {
        let query = adminClient
          .from('memberships')
          .select('id, profile_id, current_period_end, cancel_at_period_end')
          .in('status', ['active', 'trialing'])
          .not('current_period_end', 'is', null)
          .gte('current_period_end', now.toISOString())
          .lte('current_period_end', horizon.toISOString())
          .order('id', { ascending: true })
          .limit(size);

        if (cursor) query = query.gt('id', cursor);

        return unwrapList(
          await query.returns<MembershipRow[]>(),
          'Could not load memberships needing a reminder.',
        );
      },
      // No consent flag here on purpose, exactly as before: a membership about
      // to lapse is account news rather than a channel someone opted into, so a
      // live token is the only condition.
      async (rows) => {
        const preferences = await preferencesByProfile(rows.map((row) => row.profile_id));

        return rows.flatMap((row) => {
          const pushToken = preferences.get(row.profile_id)?.push_token;
          if (!pushToken) return [];

          return [
            {
              membership_id: row.id,
              profile_id: row.profile_id,
              push_token: pushToken,
              current_period_end: row.current_period_end,
              cancel_at_period_end: row.cancel_at_period_end,
            },
          ];
        });
      },
    );
  },
};
