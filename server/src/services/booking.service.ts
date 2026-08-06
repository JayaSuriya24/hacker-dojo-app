import {
  bookingRepository,
  resourceRepository,
  sessionRepository,
} from '../repositories/booking.repository.js';
import { AppError } from '../utils/errors.js';
import {
  DOJO_TIMEZONE,
  formatClockTime,
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
  ): Promise<LiveSessionView> {
    const existing = await sessionRepository.liveForProfile(user.accessToken, user.id);
    if (existing) return toLiveSessionView(existing);

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

    return toLiveSessionView(row);
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

  async endSession(user: AuthenticatedUser): Promise<LiveSessionView> {
    const session = await sessionRepository.liveForProfile(user.accessToken, user.id);
    if (!session) throw AppError.notFound('You have no live session.');

    const row = await sessionRepository.end(user.accessToken, session.id);
    return toLiveSessionView({ ...session, ...row });
  },

  /** Exposed so the client can label a slot grid without guessing the zone. */
  timezone(): string {
    return DOJO_TIMEZONE;
  },
};
