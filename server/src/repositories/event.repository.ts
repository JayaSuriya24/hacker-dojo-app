import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapList, unwrapMaybe } from '../utils/postgrest.js';
import type {
  EventCategory,
  EventFeedRow,
  EventRepeatMode,
  EventRequestRow,
  EventRsvpRow,
  EventSeriesRow,
} from '../types/database.js';

export interface EventQuery {
  category?: EventCategory | undefined;
  todayOnly?: boolean | undefined;
  limit: number;
  offset: number;
}

/**
 * A host's event request, including WHEN it runs and whether it repeats.
 *
 * The scheduling half of this interface used to be absent, and the insert below
 * mapped seven columns while the validator accepted thirteen. `hostEventSchema`
 * parsed the host's time, duration and repeat rule, the controller passed the
 * whole body through, and the six scheduling fields were then silently dropped
 * on the floor — so every request landed on the DEFAULTS the migration gives
 * those columns (`preferred_time '18:00'`, `duration_minutes 120`,
 * `repeat_mode 'once'`).
 *
 * The consequence was not a missing field on a form. `eventApprovalService`
 * branches on `repeat_mode` to decide whether to create an `event_series`, so a
 * member who asked for "every Saturday, 10:00, three hours" got a ONE-OFF event
 * at 6pm for two hours, and the entire `event_series` path was unreachable from
 * the product.
 */
export interface CreateEventRequestInput {
  profileId: string;
  title: string;
  category: EventCategory;
  expectedSize: number;
  preferredDate: string;
  preferredRoom: string;
  notes?: string | undefined;

  /** Local wall-clock start at the Dojo, `HH:MM`. A date alone builds no event. */
  preferredTime: string;
  durationMinutes: number;

  /** `once` = a single event; `weekly` = an `event_series` on `repeatWeekdays`. */
  repeatMode: EventRepeatMode;
  /** Postgres `dow`: 0 = Sunday … 6 = Saturday. Empty for a one-off. */
  repeatWeekdays: number[];
  repeatIntervalWeeks: number;
  /** Open-ended when absent. */
  repeatUntil?: string | undefined;
}

export const eventRepository = {
  /**
   * The events feed. `accessToken` is optional: a signed-out visitor gets the
   * public events, a member additionally gets members-only ones — the same
   * query, arbitrated by RLS rather than by a branch here.
   */
  async list(accessToken: string | null, query: EventQuery): Promise<EventFeedRow[]> {
    const client = accessToken ? userClient(accessToken) : adminClient;

    let request = client
      .from('event_feed')
      .select('*')
      .gte('ends_at', new Date().toISOString())
      .order('starts_at')
      .range(query.offset, query.offset + query.limit - 1);

    if (query.category) request = request.eq('category', query.category);
    if (query.todayOnly) request = request.eq('is_today', true);

    // Anonymous callers must not see members-only events even though the
    // service-role client is what serves them.
    if (!accessToken) request = request.eq('members_only', false);

    return unwrapList(await request.returns<EventFeedRow[]>(), 'Could not load events.');
  },

  /**
   * One event, by id. Same arbitration as `list`, and for the same reason.
   *
   * The anonymous branch is served by the service-role client, which bypasses
   * RLS — so `events_select_public`'s `not members_only` is not applied and has
   * to be restated here. Without it a members-only event was hidden from the
   * feed and then served in full to anyone who asked for it by id: the flag
   * held on the list and not on the thing the list links to.
   *
   * A signed-in caller needs no such filter. They go through `userClient`, and
   * RLS decides — public events for everyone, members-only for a member, plus
   * their own hosted events.
   */
  async findById(accessToken: string | null, id: string): Promise<EventFeedRow | null> {
    const client = accessToken ? userClient(accessToken) : adminClient;

    let request = client.from('event_feed').select('*').eq('id', id);
    if (!accessToken) request = request.eq('members_only', false);

    return unwrapMaybe(await request.maybeSingle<EventFeedRow>(), 'Could not load that event.');
  },

  /**
   * How many events fall inside a window — the number the weekly digest quotes.
   *
   * Counted in POSTGRES, not in JavaScript: `head: true` asks PostgREST for the
   * count alone and returns no rows at all, so nothing is paged into memory and
   * the `max_rows` ceiling on returned rows is not involved. One query, no
   * fan-out per event.
   *
   * Reads `event_feed` rather than `events` on purpose. That view is what the
   * Events tab renders, and it already carries the `status = 'published'`
   * filter — so a draft, a `pending_review` submission or a CANCELLED date is
   * excluded here for exactly the same reason it is absent from the tab, rather
   * than by a second list of statuses that could drift from it.
   *
   * Occurrences, not series. A recurring meetup is real rows in `events`, one
   * per date, each with its own RSVP list and capacity — that is the schema's
   * explicit design and what a member scrolls through — so eight Saturdays
   * count as eight events, which is what the member sees on tapping through.
   *
   * The service role bypasses RLS, so `members_only` has to be restated here
   * exactly as `list` and `findById` restate it for their anonymous path. The
   * digest is one message with one number sent to many people; counting only
   * the events EVERY recipient can see keeps it true for all of them, including
   * a lapsed member whose digest preference is still switched on.
   */
  async countPublishedBetween(startsAt: string, endsAt: string): Promise<number> {
    const { count, error } = await adminClient
      .from('event_feed')
      .select('id', { count: 'exact', head: true })
      .eq('members_only', false)
      // Half-open: an event at exactly `endsAt` belongs to the next window.
      .gte('starts_at', startsAt)
      .lt('starts_at', endsAt);

    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  /** The rule behind a recurring event. Null for a one-off. */
  async findSeries(accessToken: string | null, seriesId: string): Promise<EventSeriesRow | null> {
    const client = accessToken ? userClient(accessToken) : adminClient;
    return unwrapMaybe(
      await client
        .from('event_series')
        .select('*')
        .eq('id', seriesId)
        .maybeSingle<EventSeriesRow>(),
      'Could not load the schedule for this event.',
    );
  },

  /**
   * The other dates in a series that have not happened yet, this one included.
   *
   * Bounded rather than unbounded: the chips exist to answer "when is the next
   * one", and an open-ended weekly meetup has an unbounded number of future
   * dates that nobody scrolls.
   */
  async upcomingInSeries(
    accessToken: string | null,
    seriesId: string,
    limit: number,
  ): Promise<Array<Pick<EventFeedRow, 'id' | 'starts_at' | 'ends_at'>>> {
    const client = accessToken ? userClient(accessToken) : adminClient;

    let request = client
      .from('event_feed')
      .select('id, starts_at, ends_at')
      .eq('series_id', seriesId)
      .gte('ends_at', new Date().toISOString())
      .order('starts_at')
      .limit(limit);

    // Same restatement as `list` and `findById`: the anonymous branch runs as
    // service role, so RLS is not applying `not members_only` for us.
    if (!accessToken) request = request.eq('members_only', false);

    return unwrapList(
      await request.returns<Array<Pick<EventFeedRow, 'id' | 'starts_at' | 'ends_at'>>>(),
      'Could not load the other dates.',
    );
  },

  async rsvpsForProfile(accessToken: string, profileId: string): Promise<EventRsvpRow[]> {
    return unwrapList(
      await userClient(accessToken)
        .from('event_rsvps')
        .select('*')
        .eq('profile_id', profileId)
        .neq('status', 'cancelled')
        .returns<EventRsvpRow[]>(),
      'Could not load your RSVPs.',
    );
  },

  async findRsvp(
    accessToken: string,
    eventId: string,
    profileId: string,
  ): Promise<EventRsvpRow | null> {
    return unwrapMaybe(
      await userClient(accessToken)
        .from('event_rsvps')
        .select('*')
        .eq('event_id', eventId)
        .eq('profile_id', profileId)
        .maybeSingle<EventRsvpRow>(),
      'Could not load your RSVP.',
    );
  },

  /**
   * Upsert rather than insert: tapping RSVP after cancelling should revive the
   * same row, keeping the member's original check-in code stable.
   *
   * The returned status may be `waitlisted` even though `going` was requested —
   * the capacity trigger downgrades it inside the same transaction. The service
   * reports back whatever the database decided, never what was asked for.
   */
  async upsertRsvp(accessToken: string, eventId: string, profileId: string): Promise<EventRsvpRow> {
    return unwrap(
      await userClient(accessToken)
        .from('event_rsvps')
        .upsert(
          { event_id: eventId, profile_id: profileId, status: 'going' },
          { onConflict: 'event_id,profile_id' },
        )
        .select('*')
        .single<EventRsvpRow>(),
      'Could not save your RSVP.',
    );
  },

  async cancelRsvp(accessToken: string, eventId: string, profileId: string): Promise<void> {
    const { error } = await userClient(accessToken)
      .from('event_rsvps')
      .update({ status: 'cancelled' })
      .eq('event_id', eventId)
      .eq('profile_id', profileId);

    if (error) throw new Error(error.message);
  },

  async createRequest(
    accessToken: string,
    input: CreateEventRequestInput,
  ): Promise<EventRequestRow> {
    return unwrap(
      await userClient(accessToken)
        .from('event_requests')
        .insert({
          profile_id: input.profileId,
          title: input.title,
          category: input.category,
          expected_size: input.expectedSize,
          preferred_date: input.preferredDate,
          preferred_room: input.preferredRoom,
          notes: input.notes ?? null,

          // The scheduling half. Written explicitly rather than spread, so a
          // column added to the table is a compile error here rather than
          // another field that quietly falls back to its default.
          preferred_time: input.preferredTime,
          duration_minutes: input.durationMinutes,
          repeat_mode: input.repeatMode,
          repeat_weekdays: input.repeatWeekdays,
          repeat_interval_weeks: input.repeatIntervalWeeks,
          // Nullable in the column: no end date means the series is open-ended.
          repeat_until: input.repeatUntil ?? null,
        })
        .select('*')
        .single<EventRequestRow>(),
      'Could not submit your event request.',
    );
  },
};
