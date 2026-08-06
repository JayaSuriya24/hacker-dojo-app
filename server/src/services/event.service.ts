import { eventRepository, type EventQuery } from '../repositories/event.repository.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedUser } from '../types/http.js';
import type { EventCategory, EventFeedRow, RsvpStatus } from '../types/database.js';

export interface EventView {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: EventCategory;
  hostName: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  goingCount: number;
  waitlistCount: number;
  atCapacity: boolean;
  isToday: boolean;
  coverPath: string | null;
  /** The caller's own RSVP, or null when signed out or not attending. */
  rsvpStatus: RsvpStatus | null;
  checkinCode: string | null;
  /** Percentage full, pre-computed so the progress bar is not client arithmetic. */
  fillPercent: number;
}

function toView(
  row: EventFeedRow,
  rsvp: { status: RsvpStatus; checkin_code: string } | undefined,
): EventView {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    hostName: row.host_name,
    roomName: row.room_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity,
    goingCount: row.going_count,
    waitlistCount: row.waitlist_count,
    atCapacity: row.at_capacity,
    isToday: row.is_today,
    coverPath: row.cover_path,
    rsvpStatus: rsvp?.status ?? null,
    checkinCode: rsvp?.checkin_code ?? null,
    fillPercent: Math.min(100, Math.round((row.going_count / Math.max(1, row.capacity)) * 100)),
  };
}

export const eventService = {
  /**
   * The events feed, with the caller's RSVP state folded in.
   *
   * The RSVP lookup is one query for all of the caller's RSVPs, joined in
   * memory — not one query per event. Twelve events on screen should cost two
   * round trips, not thirteen.
   */
  async list(user: AuthenticatedUser | undefined, query: EventQuery): Promise<EventView[]> {
    const events = await eventRepository.list(user?.accessToken ?? null, query);
    if (!user) return events.map((row) => toView(row, undefined));

    const rsvps = await eventRepository.rsvpsForProfile(user.accessToken, user.id);
    const byEvent = new Map(rsvps.map((rsvp) => [rsvp.event_id, rsvp]));

    return events.map((row) => toView(row, byEvent.get(row.id)));
  },

  async detail(user: AuthenticatedUser | undefined, eventId: string): Promise<EventView> {
    const event = await eventRepository.findById(user?.accessToken ?? null, eventId);
    if (!event) throw AppError.notFound('That event is no longer listed.');

    if (!user) return toView(event, undefined);

    const rsvp = await eventRepository.findRsvp(user.accessToken, eventId, user.id);
    return toView(event, rsvp && rsvp.status !== 'cancelled' ? rsvp : undefined);
  },

  /**
   * RSVP.
   *
   * The database's capacity trigger may silently convert a `going` request into
   * `waitlisted`. That is reported back honestly rather than smoothed over —
   * "You're on the list" and "You're on the waitlist" are different promises.
   */
  async rsvp(
    user: AuthenticatedUser,
    eventId: string,
  ): Promise<{ status: RsvpStatus; checkinCode: string; message: string }> {
    const event = await eventRepository.findById(user.accessToken, eventId);
    if (!event) throw AppError.notFound('That event is no longer listed.');

    if (new Date(event.ends_at) < new Date()) {
      throw AppError.conflict('conflict', 'That event has already finished.');
    }
    if (event.members_only && !user.isActiveMember) {
      throw AppError.membershipRequired('This event is for members.');
    }

    const rsvp = await eventRepository.upsertRsvp(user.accessToken, eventId, user.id);

    return {
      status: rsvp.status,
      checkinCode: rsvp.checkin_code,
      message:
        rsvp.status === 'waitlisted'
          ? "This one filled up — you're on the waitlist."
          : "You're on the list",
    };
  },

  async cancelRsvp(user: AuthenticatedUser, eventId: string): Promise<void> {
    await eventRepository.cancelRsvp(user.accessToken, eventId, user.id);
  },

  async requestToHost(
    user: AuthenticatedUser,
    input: {
      title: string;
      category: EventCategory;
      expectedSize: number;
      preferredDate: string;
      preferredRoom: string;
      notes?: string | undefined;
    },
  ): Promise<{ reference: string }> {
    const row = await eventRepository.createRequest(user.accessToken, {
      profileId: user.id,
      ...input,
    });
    return { reference: row.reference };
  },
};
