import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapList, unwrapMaybe } from '../utils/postgrest.js';
import type {
  EventCategory,
  EventFeedRow,
  EventRequestRow,
  EventRsvpRow,
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

  async findById(accessToken: string | null, id: string): Promise<EventFeedRow | null> {
    const client = accessToken ? userClient(accessToken) : adminClient;
    return unwrapMaybe(
      await client.from('event_feed').select('*').eq('id', id).maybeSingle<EventFeedRow>(),
      'Could not load that event.',
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
