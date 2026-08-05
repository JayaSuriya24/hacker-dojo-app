import {
  bookingRepository,
  resourceRepository,
  sessionRepository,
} from '../repositories/booking.repository.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedUser } from '../types/http.js';
import type { ResourceKind } from '../types/database.js';

export interface SlotView {
  /** Local wall-clock label the UI renders, e.g. "14:00". */
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

const HOUR_MS = 60 * 60 * 1000;

function formatWhen(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time(start)} – ${time(end)}`;
}

export const bookingService = {
  async listResources(kind?: ResourceKind) {
    return resourceRepository.list(kind);
  },

  /**
   * Availability for one resource on one day.
   *
   * Slots come from the resource's own opening hours rather than a fixed 9-to-9
   * grid, so a room with different hours renders correctly without a special
   * case in the client. Overlap is computed against confirmed bookings; the
   * result is advisory — the exclusion constraint is what actually decides.
   */
  async availability(resourceId: string, day: string): Promise<SlotView[]> {
    const resource = await resourceRepository.findById(resourceId);
    if (!resource) throw AppError.notFound('That resource is no longer listed.');

    const dayStart = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(dayStart.getTime())) throw AppError.badRequest('That date is not valid.');

    const dayEnd = new Date(dayStart.getTime() + 24 * HOUR_MS);
    const busy = await resourceRepository.busyRanges(
      resourceId,
      dayStart.toISOString(),
      dayEnd.toISOString(),
    );

    const openHour = Number(resource.opens_at.slice(0, 2));
    const closeHour = Number(resource.closes_at.slice(0, 2));
    const slotHours = Math.max(1, Math.round(resource.min_duration_minutes / 60));

    const slots: SlotView[] = [];
    for (let hour = openHour; hour + slotHours <= closeHour; hour += slotHours) {
      const slotStart = new Date(dayStart);
      slotStart.setUTCHours(hour, 0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + slotHours * HOUR_MS);

      const overlaps = busy.some(
        (range) => new Date(range.starts_at) < slotEnd && new Date(range.ends_at) > slotStart,
      );

      slots.push({
        label: `${String(hour).padStart(2, '0')}:00`,
        startsAt: slotStart.toISOString(),
        // A slot already in the past is shown, but not bookable.
        available: !overlaps && slotStart.getTime() > Date.now(),
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
      when: formatWhen(row.starts_at, row.ends_at),
    }));
  },

  /**
   * Create a reservation.
   *
   * The duration ceiling is re-derived here rather than trusted from the
   * client's `durationHours`: the mobile stepper caps at 4, but nothing stops a
   * crafted request from asking for 400. The database enforces it too — this
   * check exists to return a helpful message instead of a constraint violation.
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
    if (Number.isNaN(startsAt.getTime()))
      throw AppError.badRequest('That start time is not valid.');
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
      when: formatWhen(row.starts_at, row.ends_at),
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
      when: formatWhen(row.starts_at, row.ends_at),
    };
  },

  async cancel(user: AuthenticatedUser, bookingId: string): Promise<void> {
    const existing = await bookingRepository.findById(user.accessToken, bookingId);
    if (!existing) throw AppError.notFound('That reservation no longer exists.');
    await bookingRepository.cancel(user.accessToken, bookingId);
  },

  async liveSession(user: AuthenticatedUser) {
    return sessionRepository.liveForProfile(user.accessToken, user.id);
  },

  /** Extend the live booth session by 15 minutes, capped at two hours total. */
  async extendSession(user: AuthenticatedUser) {
    const session = await sessionRepository.liveForProfile(user.accessToken, user.id);
    if (!session) throw AppError.notFound('You have no live session.');

    const nextExpiry = new Date(new Date(session.expires_at).getTime() + 15 * 60_000);
    const ceiling = new Date(new Date(session.started_at).getTime() + 2 * HOUR_MS);

    if (nextExpiry > ceiling) {
      throw AppError.conflict(
        'conflict',
        'A booth session tops out at two hours. Book a new slot.',
      );
    }

    return sessionRepository.extend(user.accessToken, session.id, nextExpiry.toISOString());
  },

  async endSession(user: AuthenticatedUser) {
    const session = await sessionRepository.liveForProfile(user.accessToken, user.id);
    if (!session) throw AppError.notFound('You have no live session.');
    return sessionRepository.end(user.accessToken, session.id);
  },
};
