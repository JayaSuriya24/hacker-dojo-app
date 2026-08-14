import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapList, unwrapMaybe } from '../utils/postgrest.js';
import type {
  EventCategory,
  EventFeedRow,
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

export interface CreateEventRequestInput {
  profileId: string;
  title: string;
  category: EventCategory;
  expectedSize: number;
  preferredDate: string;
  preferredRoom: string;
  notes?: string | undefined;
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
        })
        .select('*')
        .single<EventRequestRow>(),
      'Could not submit your event request.',
    );
  },
};
