import { describe, expect, it, vi, beforeEach } from 'vitest';
import { bookingService } from '../booking.service.js';
import { resourceRepository } from '../../repositories/booking.repository.js';
import { AppError } from '../../utils/errors.js';
import type { ResourceAvailabilityRow } from '../../types/database.js';

vi.mock('../../repositories/booking.repository.js', () => ({
  resourceRepository: { findById: vi.fn(), busyRanges: vi.fn(), list: vi.fn() },
  bookingRepository: {
    create: vi.fn(),
    listForProfile: vi.fn(),
    findById: vi.fn(),
    cancel: vi.fn(),
    reschedule: vi.fn(),
  },
  sessionRepository: { liveForProfile: vi.fn(), extend: vi.fn(), end: vi.fn() },
}));

const laser: ResourceAvailabilityRow = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'glowforge',
  kind: 'hardware',
  name: 'Glowforge Pro laser',
  model: 'Laser cutter · 20×12 bed',
  seats: null,
  amenities: null,
  status: 'available',
  requires_cert: true,
  min_duration_minutes: 60,
  max_duration_minutes: 180,
  opens_at: '09:00:00',
  closes_at: '21:00:00',
  image_path: null,
  zone_name: 'Hardware Lab',
  free_from: new Date().toISOString(),
};

const user = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'ana@reyes.dev',
  role: 'member' as const,
  accessToken: 'token',
  isActiveMember: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bookingService.availability', () => {
  it('derives slots from the resource opening hours, not a fixed grid', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue({
      ...laser,
      opens_at: '10:00:00',
      closes_at: '13:00:00',
    });
    vi.mocked(resourceRepository.busyRanges).mockResolvedValue([]);

    const slots = await bookingService.availability(laser.id, '2099-01-01');

    expect(slots.map((slot) => slot.label)).toEqual(['10:00', '11:00', '12:00']);
  });

  it('marks a slot unavailable when a confirmed booking overlaps it', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue(laser);
    // 11:00–13:00 in Mountain View on a January day is 19:00–21:00Z (PST, -08).
    // This assertion previously used the bare UTC instants and passed, which is
    // precisely how the timezone bug survived: the test encoded it.
    vi.mocked(resourceRepository.busyRanges).mockResolvedValue([
      { starts_at: '2099-01-01T19:00:00.000Z', ends_at: '2099-01-01T21:00:00.000Z' },
    ]);

    const slots = await bookingService.availability(laser.id, '2099-01-01');
    const taken = slots.filter((slot) => !slot.available).map((slot) => slot.label);

    expect(taken).toEqual(['11:00', '12:00']);
  });

  /**
   * The regression this whole change exists for.
   *
   * `opens_at` is a local `time`, and the old implementation walked it with
   * `setUTCHours` — so the "09:00" a member tapped reserved 09:00Z, which is
   * 01:00 or 02:00 in Mountain View depending on the season.
   */
  it('resolves opening hours against the Dojo wall clock, not UTC', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue(laser);
    vi.mocked(resourceRepository.busyRanges).mockResolvedValue([]);

    const winter = await bookingService.availability(laser.id, '2099-01-15');
    const summer = await bookingService.availability(laser.id, '2099-07-15');

    // 09:00 PST is 17:00Z; 09:00 PDT is 16:00Z. The label is 09:00 in both.
    expect(winter[0]?.label).toBe('09:00');
    expect(winter[0]?.startsAt).toBe('2099-01-15T17:00:00.000Z');

    expect(summer[0]?.label).toBe('09:00');
    expect(summer[0]?.startsAt).toBe('2099-07-15T16:00:00.000Z');
  });

  it('closes the grid on the local closing hour', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue(laser);
    vi.mocked(resourceRepository.busyRanges).mockResolvedValue([]);

    const slots = await bookingService.availability(laser.id, '2099-07-15');
    const last = slots.at(-1);

    // Closes at 21:00 local, and slots are an hour, so the last start is 20:00.
    expect(last?.label).toBe('20:00');
    expect(last?.startsAt).toBe('2099-07-16T03:00:00.000Z');
  });

  it('never offers a slot in the past', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue(laser);
    vi.mocked(resourceRepository.busyRanges).mockResolvedValue([]);

    const slots = await bookingService.availability(laser.id, '2000-01-01');

    expect(slots.every((slot) => !slot.available)).toBe(true);
  });
});

describe('bookingService.create', () => {
  it('refuses a duration outside the resource rules with an actionable message', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue(laser);

    await expect(
      bookingService.create(user, {
        resourceId: laser.id,
        startsAt: '2099-01-01T10:00:00.000Z',
        durationHours: 4,
      }),
    ).rejects.toThrow(/1–3 hours/);
  });

  it('refuses a booking on a resource under maintenance', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue({ ...laser, status: 'maintenance' });

    await expect(
      bookingService.create(user, {
        resourceId: laser.id,
        startsAt: '2099-01-01T10:00:00.000Z',
        durationHours: 1,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('refuses a start time in the past', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue(laser);

    await expect(
      bookingService.create(user, {
        resourceId: laser.id,
        startsAt: '2000-01-01T10:00:00.000Z',
        durationHours: 1,
      }),
    ).rejects.toThrow(/future/);
  });
});
