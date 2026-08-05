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
    vi.mocked(resourceRepository.busyRanges).mockResolvedValue([
      { starts_at: '2099-01-01T11:00:00.000Z', ends_at: '2099-01-01T13:00:00.000Z' },
    ]);

    const slots = await bookingService.availability(laser.id, '2099-01-01');
    const taken = slots.filter((slot) => !slot.available).map((slot) => slot.label);

    expect(taken).toEqual(['11:00', '12:00']);
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
