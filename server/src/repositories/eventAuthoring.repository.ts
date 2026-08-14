import { adminClient } from '../config/supabase.js';
import { unwrap } from '../utils/postgrest.js';
import type { EventCategory, EventSeriesRow } from '../types/database.js';

/**
 * Putting an event on the calendar.
 *
 * Service role, and necessarily so: `events` and `event_series` have select
 * policies and no client write policy at all, because what is on the Dojo's
 * calendar is the building's statement rather than something a member may
 * insert. A steward's approval is expressed as an API call that lands here, not
 * as a row a client writes directly.
 */

export interface EventTemplate {
  title: string;
  category: EventCategory;
  hostName: string;
  hostProfileId: string;
  roomName: string;
  capacity: number;
  notes: string | null;
}

/** Lowercase, hyphenated, ASCII — the shape the slug columns expect. */
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  // A title of pure punctuation would otherwise produce an empty slug and
  // violate the column's format check.
  return base || 'event';
}

/**
 * Slugs are unique across every event, and two hosts naming their meetup the
 * same thing is ordinary rather than exceptional. The suffix keeps the readable
 * part readable instead of prefixing a uuid nobody can say out loud.
 */
function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export const eventAuthoringRepository = {
  /**
   * How many people a named room seats, or null when the name is not a room we
   * hold. `preferred_room` is free text chosen from a chip list rather than a
   * foreign key, so this is a lookup by name and has to tolerate a miss.
   */
  async roomCapacity(roomName: string): Promise<number | null> {
    const { data, error } = await adminClient
      .from('resources')
      .select('seats')
      .eq('kind', 'room')
      .eq('name', roomName)
      .maybeSingle<{ seats: number | null }>();

    if (error) throw new Error(error.message);
    return data?.seats ?? null;
  },

  /** One event, on one date. */
  async createEvent(input: {
    template: EventTemplate;
    startsAt: string;
    endsAt: string;
  }): Promise<{ id: string }> {
    const { template } = input;

    return unwrap(
      await adminClient
        .from('events')
        .insert({
          slug: `${slugify(template.title)}-${uniqueSuffix()}`,
          title: template.title,
          description: template.notes,
          category: template.category,
          status: 'published',
          host_profile_id: template.hostProfileId,
          host_name: template.hostName,
          room_name: template.roomName,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          capacity: template.capacity,
        })
        .select('id')
        .single<{ id: string }>(),
      'Could not put that event on the calendar.',
    );
  },

  /** The rule. Occurrences are generated from it separately. */
  async createSeries(input: {
    template: EventTemplate;
    startsOn: string;
    startsTime: string;
    durationMinutes: number;
    weekdays: number[];
    intervalWeeks: number;
    untilDate: string | null;
  }): Promise<EventSeriesRow> {
    const { template } = input;

    return unwrap(
      await adminClient
        .from('event_series')
        .insert({
          slug_prefix: `${slugify(template.title)}-${uniqueSuffix()}`,
          title: template.title,
          description: template.notes,
          category: template.category,
          host_profile_id: template.hostProfileId,
          host_name: template.hostName,
          room_name: template.roomName,
          capacity: template.capacity,
          starts_on: input.startsOn,
          starts_time: input.startsTime,
          duration_minutes: input.durationMinutes,
          weekdays: input.weekdays,
          interval_weeks: input.intervalWeeks,
          until_date: input.untilDate,
        })
        .select('*')
        .single<EventSeriesRow>(),
      'Could not create that schedule.',
    );
  },

  /**
   * Record what the approval produced.
   *
   * Written back onto the request so a second approval sees it and stops. The
   * alternative — trusting the status column alone — puts a duplicate meetup on
   * the calendar the moment a steward taps twice on a slow connection.
   */
  async markRequestFulfilled(
    requestId: string,
    produced: { eventId?: string; seriesId?: string },
  ): Promise<void> {
    const { error } = await adminClient
      .from('event_requests')
      .update({
        created_event_id: produced.eventId ?? null,
        created_series_id: produced.seriesId ?? null,
      })
      .eq('id', requestId);

    if (error) throw new Error(error.message);
  },
};
