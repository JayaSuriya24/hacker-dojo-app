import {
  bookingRepository,
  resourceRepository,
  sessionRepository,
} from '../repositories/booking.repository.js';
import { occupancyRepository } from '../repositories/staff.repository.js';
import { communityService, type OccupancyView } from './community.service.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';
import {
  DOJO_TIMEZONE,
  dojoToday,
  formatClockTime,
  formatDojoClockRange,
  formatDojoRange,
  fromDojoWallClock,
  parseClockTime,
  parseIsoDate,
} from '../utils/time.js';
import type { AuthenticatedUser } from '../types/http.js';
import type { ResourceKind, ResourceStatus } from '../types/database.js';

export interface SlotView {
  /** Wall-clock label in the Dojo's zone, e.g. "14:00". */
  label: string;
  startsAt: string;
  available: boolean;
}

/**
 * One reservation as another member sees it.
 *
 * Still no booking id and no reference — those are the owner's handles for
 * modifying or cancelling, and nobody else has business holding them.
 */
export interface ReservationView {
  resourceId: string;
  resourceName: string;
  startsAt: string;
  endsAt: string;
  /** `11:00 AM – 12:00 PM`, in the space's clock. */
  window: string;
  /** True while it is happening right now. */
  active: boolean;
  /**
   * Who has the room.
   *
   * `null` for anyone who is not an active member — the name is never sent, not
   * sent-and-hidden. `'A member'` when the booker has directory visibility
   * turned off.
   */
  bookedBy: string | null;
}

export interface BookingView {
  id: string;
  reference: string;
  resourceId: string;
  resourceName: string;
  resourceKind: ResourceKind | null;
  startsAt: string;
  endsAt: string;
  when: string;
}

/**
 * A resource as the app renders it.
 *
 * The endpoint used to return the view row unchanged, which leaked
 * `requires_cert` / `min_duration_minutes` / `free_from` into a client that is
 * camelCase everywhere else. Mapping here costs one object per resource and
 * keeps `domain.ts` speaking one language.
 */
export interface ResourceView {
  id: string;
  slug: string;
  kind: ResourceKind;
  name: string;
  model: string | null;
  seats: number | null;
  amenities: string | null;
  status: ResourceStatus;
  requiresCert: boolean;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  opensAt: string;
  closesAt: string;
  imagePath: string | null;
  zoneName: string | null;
  freeFrom: string;
}

export interface LiveSessionView {
  id: string;
  profileId: string;
  resourceId: string | null;
  resourceName: string;
  resourceKind: ResourceKind | null;
  zoneName: string | null;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
}

/**
 * What check-in and check-out answer: the session, plus the occupancy the act
 * produced so the caller does not have to ask for it. `occupancy` is null when
 * nothing changed (already checked in) or the resample failed.
 */
export interface PresenceChange {
  session: LiveSessionView;
  occupancy: OccupancyView | null;
}

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
/** A booth session runs two hours at most, extensions included. */
const SESSION_CEILING_MS = 2 * HOUR_MS;
const SESSION_EXTENSION_MS = 15 * MINUTE_MS;
/** How long a self check-in holds the floor before it lapses. */
const CHECKIN_DURATION_MS = 4 * HOUR_MS;

function toResourceView(row: {
  id: string;
  slug: string;
  kind: ResourceKind;
  name: string;
  model: string | null;
  seats: number | null;
  amenities: string | null;
  status: ResourceStatus;
  requires_cert: boolean;
  min_duration_minutes: number;
  max_duration_minutes: number;
  opens_at: string;
  closes_at: string;
  image_path: string | null;
  zone_name: string | null;
  free_from: string;
}): ResourceView {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    name: row.name,
    model: row.model,
    seats: row.seats,
    amenities: row.amenities,
    status: row.status,
    requiresCert: row.requires_cert,
    minDurationMinutes: row.min_duration_minutes,
    maxDurationMinutes: row.max_duration_minutes,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    imagePath: row.image_path,
    zoneName: row.zone_name,
    freeFrom: row.free_from,
  };
}

function toLiveSessionView(row: {
  id: string;
  profile_id: string;
  resource_id: string | null;
  resource_name: string;
  resource_kind: ResourceKind | null;
  zone_name: string | null;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
}): LiveSessionView {
  return {
    id: row.id,
    profileId: row.profile_id,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    resourceKind: row.resource_kind,
    zoneName: row.zone_name,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    endedAt: row.ended_at,
  };
}

/**
 * Take an occupancy sample now, because presence just changed, and hand back
 * the number it produced.
 *
 * `current_occupancy` reports the LATEST SAMPLE per zone, not a live count, and
 * the scheduler samples on a timer — so without this a member who checks in
 * watches the dial sit on the old number for up to a minute and concludes the
 * button is broken. Sampling here makes the very next read correct.
 *
 * The sample is RETURNED rather than left for the app to go and fetch. Making
 * the client re-request it looks equivalent and is not: `/occupancy` is sent
 * with `Cache-Control: max-age=15` to survive the 9am stampede, so the refetch
 * that follows check-in is served from the device's HTTP cache and yields the
 * pre-check-in number — the dial then sits wrong until the 60s poll. Carrying
 * the count on this response keeps that cache useful to everyone else while the
 * member who just acted sees the truth immediately.
 *
 * A failure is swallowed and reported as null. A stale dial is not worth
 * failing a check-in over, and the next scheduled sample corrects it.
 */
async function resampleOccupancy(reason: string): Promise<OccupancyView | null> {
  try {
    await occupancyRepository.sample();
    return await communityService.occupancy();
  } catch (error) {
    logger.warn({ err: error, reason }, 'Occupancy resample failed');
    return null;
  }
}

export const bookingService = {
  async listResources(kind?: ResourceKind): Promise<ResourceView[]> {
    const rows = await resourceRepository.list(kind);
    return rows.map(toResourceView);
  },

  /**
   * Availability for one resource on one day, in the Dojo's zone.
   *
   * The previous implementation walked `opens_at`'s hour with `setUTCHours`, so
   * the "09:00" a member tapped reserved 09:00Z — 02:00 in Mountain View. Hours
   * are now resolved through `fromDojoWallClock`, which asks ICU for the offset
   * that actually applied on that date, so the grid is correct on both sides of
   * a DST change rather than an hour out for half the year.
   *
   * Overlap is still advisory. The `bookings_no_overlap` exclusion constraint
   * is what decides; this only avoids offering a slot that is visibly taken.
   */
  async availability(resourceId: string, day: string): Promise<SlotView[]> {
    const resource = await resourceRepository.findById(resourceId);
    if (!resource) throw AppError.notFound('That resource is no longer listed.');

    const date = parseIsoDate(day);
    if (!date) throw AppError.badRequest('That date is not valid.');

    const dayStart = fromDojoWallClock({ ...date, hour: 0 });
    const dayEnd = fromDojoWallClock({ ...date, hour: 0, day: date.day + 1 });

    const busy = await resourceRepository.busyRanges(
      resourceId,
      dayStart.toISOString(),
      dayEnd.toISOString(),
    );

    const openMinutes = parseClockTime(resource.opens_at);
    const closeMinutes = parseClockTime(resource.closes_at);
    const slotMinutes = Math.max(60, resource.min_duration_minutes);

    const slots: SlotView[] = [];
    const now = Date.now();

    for (let minutes = openMinutes; minutes + slotMinutes <= closeMinutes; minutes += slotMinutes) {
      const slotStart = fromDojoWallClock({
        ...date,
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
      });
      const slotEnd = new Date(slotStart.getTime() + slotMinutes * MINUTE_MS);

      const overlaps = busy.some(
        (range) => new Date(range.starts_at) < slotEnd && new Date(range.ends_at) > slotStart,
      );

      slots.push({
        label: formatClockTime(minutes),
        startsAt: slotStart.toISOString(),
        // A slot in the past is shown for context but is not bookable.
        available: !overlaps && slotStart.getTime() > now,
      });
    }

    return slots;
  },

  /**
   * Every reservation on one day, for one kind of resource.
   *
   * Times are public, as they already were on the availability grid. The
   * BOOKER'S NAME is not: it is attached only for a caller who is an active
   * member AND only for a member who has not hidden themselves, which is the
   * identical rule the members directory enforces in RLS
   * (`directory_visible and is_active_member()`).
   *
   * Two consequences worth stating, because they are easy to misread as bugs:
   *
   *   · A signed-out visitor and a lapsed member see the room and the window
   *     with no name at all — not "Anonymous", the field is simply absent.
   *   · A member who turned off directory visibility shows as "A member" to
   *     everyone else. Their booking still appears, because the room really is
   *     taken; only the identity is withheld. Someone who opted out of being
   *     listed did not opt into being findable by which room they are in.
   */
  async daySchedule(
    kind: ResourceKind,
    day?: string,
    viewer?: AuthenticatedUser | undefined,
  ): Promise<ReservationView[]> {
    const target = day ?? dojoToday();

    const date = parseIsoDate(target);
    if (!date) throw AppError.badRequest('That date is not valid.');

    const resources = await resourceRepository.list(kind);
    if (resources.length === 0) return [];

    const names = new Map(resources.map((resource) => [resource.id, resource.name]));

    const dayStart = fromDojoWallClock({ ...date, hour: 0 });
    const dayEnd = fromDojoWallClock({ ...date, hour: 0, day: date.day + 1 });

    const rows = await resourceRepository.busyRangesFor(
      resources.map((resource) => resource.id),
      dayStart.toISOString(),
      dayEnd.toISOString(),
    );

    const now = Date.now();

    // The single gate. Everything below reads it; nothing else decides.
    const maySeeNames = viewer?.isActiveMember === true;

    return rows.map((row) => {
      const booker = maySeeNames
        ? (row.profiles?.directory_visible ?? false)
          ? (row.profiles?.full_name ?? null)
          : 'A member'
        : null;

      return {
        resourceId: row.resource_id,
        resourceName: names.get(row.resource_id) ?? 'Reservation',
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        window: formatDojoClockRange(row.starts_at, row.ends_at),
        active: new Date(row.starts_at).getTime() <= now && new Date(row.ends_at).getTime() > now,
        bookedBy: booker,
      };
    });
  },

  async listMine(user: AuthenticatedUser): Promise<BookingView[]> {
    const rows = await bookingRepository.listForProfile(user.accessToken, user.id);

    return rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      resourceId: row.resource_id,
      resourceName: row.resources?.name ?? 'Reservation',
      resourceKind: row.resources?.kind ?? null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      when: formatDojoRange(row.starts_at, row.ends_at),
    }));
  },

  /**
   * Create a reservation.
   *
   * The duration ceiling is re-derived here rather than trusted from the
   * client's `durationHours`: the mobile stepper caps at 4, but nothing stops a
   * crafted request from asking for 400. The database enforces it too — these
   * checks exist to return a sentence instead of a constraint violation.
   */
  async create(
    user: AuthenticatedUser,
    input: {
      resourceId: string;
      startsAt: string;
      durationHours: number;
      notes?: string | undefined;
    },
  ): Promise<BookingView> {
    const resource = await resourceRepository.findById(input.resourceId);
    if (!resource) throw AppError.notFound('That resource is no longer listed.');
    if (resource.status === 'maintenance') {
      throw AppError.conflict('conflict', `${resource.name} is under maintenance right now.`);
    }

    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw AppError.badRequest('That start time is not valid.');
    }
    if (startsAt.getTime() < Date.now()) {
      throw AppError.badRequest('Pick a start time in the future.');
    }

    const minutes = input.durationHours * 60;
    if (minutes < resource.min_duration_minutes || minutes > resource.max_duration_minutes) {
      throw AppError.badRequest(
        `${resource.name} can be booked for ${resource.min_duration_minutes / 60}–${
          resource.max_duration_minutes / 60
        } hours.`,
      );
    }

    const endsAt = new Date(startsAt.getTime() + input.durationHours * HOUR_MS);

    const row = await bookingRepository.create(user.accessToken, {
      profileId: user.id,
      resourceId: input.resourceId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      notes: input.notes,
    });

    return {
      id: row.id,
      reference: row.reference,
      resourceId: row.resource_id,
      resourceName: resource.name,
      resourceKind: resource.kind,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      when: formatDojoRange(row.starts_at, row.ends_at),
    };
  },

  async reschedule(
    user: AuthenticatedUser,
    bookingId: string,
    input: { resourceId: string; startsAt: string; durationHours: number },
  ): Promise<BookingView> {
    const existing = await bookingRepository.findById(user.accessToken, bookingId);
    if (!existing) throw AppError.notFound('That reservation no longer exists.');
    if (existing.status !== 'confirmed') {
      throw AppError.conflict('conflict', 'That reservation is no longer active.');
    }

    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw AppError.badRequest('That start time is not valid.');
    }
    if (startsAt.getTime() < Date.now()) {
      throw AppError.badRequest('Pick a start time in the future.');
    }

    const endsAt = new Date(startsAt.getTime() + input.durationHours * HOUR_MS);

    const row = await bookingRepository.reschedule(user.accessToken, bookingId, {
      resourceId: input.resourceId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    });

    const resource = await resourceRepository.findById(row.resource_id);

    return {
      id: row.id,
      reference: row.reference,
      resourceId: row.resource_id,
      resourceName: resource?.name ?? 'Reservation',
      resourceKind: resource?.kind ?? null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      when: formatDojoRange(row.starts_at, row.ends_at),
    };
  },

  async cancel(user: AuthenticatedUser, bookingId: string): Promise<void> {
    const existing = await bookingRepository.findById(user.accessToken, bookingId);
    if (!existing) throw AppError.notFound('That reservation no longer exists.');
    await bookingRepository.cancel(user.accessToken, bookingId);
  },

  async liveSession(user: AuthenticatedUser): Promise<LiveSessionView | null> {
    const row = await sessionRepository.liveForProfile(user.accessToken, user.id);
    return row ? toLiveSessionView(row) : null;
  },

  /**
   * Check in to the floor.
   *
   * Nothing wrote `sessions`, so the directory's presence dot, the "Who's here"
   * tab and the occupancy dial were all permanently empty. A member checks
   * themselves in; the partial unique index on `(profile_id) where ended_at is
   * null` is what stops two live sessions, so a double tap is a 409 rather than
   * a duplicate.
   */
  async checkIn(
    user: AuthenticatedUser,
    input: { resourceId?: string | undefined },
  ): Promise<PresenceChange> {
    // Re-entering does not open a second session, so nothing changed and there
    // is no new number to report — the dial the app already holds is correct.
    const existing = await sessionRepository.liveForProfile(user.accessToken, user.id);
    if (existing) return { session: toLiveSessionView(existing), occupancy: null };

    // A session that expired without a checkout is invisible to the read above
    // and still holds the unique index slot, so the insert below would fail as
    // a duplicate and lock the member out of the floor permanently. Closing it
    // first is what makes checking in possible the day after checking in.
    await sessionRepository.endExpiredFor(user.accessToken, user.id);

    if (input.resourceId) {
      const resource = await resourceRepository.findById(input.resourceId);
      if (!resource) throw AppError.notFound('That resource is no longer listed.');
      if (resource.status === 'maintenance') {
        throw AppError.conflict('conflict', `${resource.name} is under maintenance right now.`);
      }
    }

    const row = await sessionRepository.create(user.accessToken, {
      profileId: user.id,
      resourceId: input.resourceId ?? null,
      expiresAt: new Date(Date.now() + CHECKIN_DURATION_MS).toISOString(),
    });

    const occupancy = await resampleOccupancy('check-in');
    return { session: toLiveSessionView(row), occupancy };
  },

  /** Extend the live session by 15 minutes, capped at two hours total. */
  async extendSession(user: AuthenticatedUser): Promise<LiveSessionView> {
    const session = await sessionRepository.liveForProfile(user.accessToken, user.id);
    if (!session) throw AppError.notFound('You have no live session.');

    const nextExpiry = new Date(new Date(session.expires_at).getTime() + SESSION_EXTENSION_MS);
    const ceiling = new Date(new Date(session.started_at).getTime() + SESSION_CEILING_MS);

    if (session.resource_kind === 'room' && nextExpiry > ceiling) {
      throw AppError.conflict(
        'conflict',
        'A booth session tops out at two hours. Book a new slot.',
      );
    }

    const row = await sessionRepository.extend(
      user.accessToken,
      session.id,
      nextExpiry.toISOString(),
    );
    // The update returns the bare row; the resource name came from the view, so
    // merge rather than re-querying just to re-read a name that cannot change.
    return toLiveSessionView({ ...session, ...row });
  },

  async endSession(user: AuthenticatedUser): Promise<PresenceChange> {
    const session = await sessionRepository.liveForProfile(user.accessToken, user.id);
    if (!session) throw AppError.notFound('You have no live session.');

    const row = await sessionRepository.end(user.accessToken, session.id);

    const occupancy = await resampleOccupancy('check-out');
    return { session: toLiveSessionView({ ...session, ...row }), occupancy };
  },

  /** Exposed so the client can label a slot grid without guessing the zone. */
  timezone(): string {
    return DOJO_TIMEZONE;
  },
};
