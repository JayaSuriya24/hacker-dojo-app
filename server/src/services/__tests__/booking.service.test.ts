import { describe, expect, it, vi, beforeEach } from 'vitest';
import { bookingService } from '../booking.service.js';
import { resourceRepository, sessionRepository } from '../../repositories/booking.repository.js';
import { occupancyRepository } from '../../repositories/staff.repository.js';
import { communityService } from '../community.service.js';
import { AppError } from '../../utils/errors.js';
import type { ResourceAvailabilityRow } from '../../types/database.js';

vi.mock('../../repositories/booking.repository.js', () => ({
  resourceRepository: {
    findById: vi.fn(),
    busyRanges: vi.fn(),
    busyRangesFor: vi.fn(),
    list: vi.fn(),
  },
  bookingRepository: {
    create: vi.fn(),
    listForProfile: vi.fn(),
    findById: vi.fn(),
    cancel: vi.fn(),
    reschedule: vi.fn(),
  },
  sessionRepository: {
    liveForProfile: vi.fn(),
    create: vi.fn(),
    extend: vi.fn(),
    end: vi.fn(),
    endExpiredFor: vi.fn(),
  },
}));

vi.mock('../../repositories/staff.repository.js', () => ({
  occupancyRepository: { sample: vi.fn(), prune: vi.fn(), current: vi.fn() },
}));

// Check-in reads the dial back after sampling so it can answer with the new
// number; without this the service would reach for a real Supabase client.
vi.mock('../community.service.js', () => ({
  communityService: { occupancy: vi.fn() },
}));

const DIAL = {
  total: 2,
  capacity: 100,
  percent: 2,
  zones: [{ name: 'Main Floor', headCount: 2, capacity: 55 }],
};

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

/**
 * The dial reads the LATEST occupancy sample, not a live count, so presence
 * changes have to force a sample or the number stays wrong for up to a minute —
 * long enough for the member who just pressed Check in to read the button as
 * broken.
 */
describe('presence sampling', () => {
  const liveRow = {
    id: '33333333-3333-4333-8333-333333333333',
    profile_id: user.id,
    resource_id: null,
    resource_name: 'Main Floor',
    resource_kind: null,
    zone_name: 'Main Floor',
    started_at: '2026-08-10T18:00:00.000Z',
    expires_at: '2026-08-10T22:00:00.000Z',
    ended_at: null,
  };

  it('samples occupancy when a member checks in', async () => {
    vi.mocked(sessionRepository.liveForProfile).mockResolvedValue(null);
    vi.mocked(sessionRepository.create).mockResolvedValue(liveRow);

    await bookingService.checkIn(user, {});

    expect(occupancyRepository.sample).toHaveBeenCalledTimes(1);
  });

  /**
   * The count has to travel on this response. `/occupancy` is cached for 15s,
   * so a client that re-fetches instead is answered from its own HTTP cache
   * with the pre-check-in number and shows a dial that ignores the tap.
   */
  it('answers check-in with the occupancy the check-in produced', async () => {
    vi.mocked(sessionRepository.liveForProfile).mockResolvedValue(null);
    vi.mocked(sessionRepository.create).mockResolvedValue(liveRow);
    vi.mocked(communityService.occupancy).mockResolvedValue(DIAL);

    await expect(bookingService.checkIn(user, {})).resolves.toMatchObject({ occupancy: DIAL });
  });

  it('answers check-out with the occupancy too', async () => {
    vi.mocked(sessionRepository.liveForProfile).mockResolvedValue(liveRow);
    vi.mocked(sessionRepository.end).mockResolvedValue({
      ...liveRow,
      ended_at: '2026-08-10T19:00:00.000Z',
    });
    vi.mocked(communityService.occupancy).mockResolvedValue(DIAL);

    await expect(bookingService.endSession(user)).resolves.toMatchObject({ occupancy: DIAL });
  });

  it('samples occupancy when a member checks out', async () => {
    vi.mocked(sessionRepository.liveForProfile).mockResolvedValue(liveRow);
    vi.mocked(sessionRepository.end).mockResolvedValue({
      ...liveRow,
      ended_at: '2026-08-10T19:00:00.000Z',
    });

    await bookingService.endSession(user);

    expect(occupancyRepository.sample).toHaveBeenCalledTimes(1);
  });

  // A stale dial is not worth failing a check-in over; the scheduled sample
  // corrects it a minute later either way.
  it('still checks the member in when the sample fails', async () => {
    vi.mocked(sessionRepository.liveForProfile).mockResolvedValue(null);
    vi.mocked(sessionRepository.create).mockResolvedValue(liveRow);
    vi.mocked(occupancyRepository.sample).mockRejectedValue(new Error('postgrest down'));

    await expect(bookingService.checkIn(user, {})).resolves.toMatchObject({
      session: { id: liveRow.id },
      // The caller is told the number is unavailable rather than given a wrong
      // one, so the dial keeps what it has until the scheduled sample lands.
      occupancy: null,
    });
  });

  /**
   * The lockout. `sessions_one_live_per_profile` keys on `ended_at is null`
   * alone, while every read of a session also demands `expires_at > now()`. A
   * session that timed out rather than being ended is therefore invisible to
   * the read above and still holds the index slot, so the insert came back as a
   * unique violation — "That already exists." — and stayed that way forever,
   * because check-out could not see the row either.
   */
  it('closes a session that expired without a check-out before checking in again', async () => {
    vi.mocked(sessionRepository.liveForProfile).mockResolvedValue(null);
    vi.mocked(sessionRepository.create).mockResolvedValue(liveRow);

    await bookingService.checkIn(user, {});

    expect(sessionRepository.endExpiredFor).toHaveBeenCalledWith(user.accessToken, user.id);

    // Order matters: the slot has to be free before the insert, or the insert
    // is the thing that fails.
    const reaped = vi.mocked(sessionRepository.endExpiredFor).mock.invocationCallOrder[0] ?? 0;
    const created = vi.mocked(sessionRepository.create).mock.invocationCallOrder[0] ?? 0;
    expect(reaped).toBeGreaterThan(0);
    expect(reaped).toBeLessThan(created);
  });

  // Someone already on the floor keeps the session they have — the reap is for
  // rows the read cannot see, not for the one it just returned.
  it('does not close anything when the member is genuinely checked in', async () => {
    vi.mocked(sessionRepository.liveForProfile).mockResolvedValue(liveRow);

    await bookingService.checkIn(user, {});

    expect(sessionRepository.endExpiredFor).not.toHaveBeenCalled();
    expect(sessionRepository.create).not.toHaveBeenCalled();
  });

  // Re-entering does not open a second session, so there is nothing new to
  // count and nothing to sample.
  it('does not sample when the member is already checked in', async () => {
    vi.mocked(sessionRepository.liveForProfile).mockResolvedValue(liveRow);

    await bookingService.checkIn(user, {});

    expect(occupancyRepository.sample).not.toHaveBeenCalled();
  });
});

/**
 * Who may see whose name.
 *
 * The rule is the one the members directory already enforces in RLS —
 * `directory_visible and is_active_member()` — restated here because this path
 * runs as the service role and so has no RLS to fall back on. Each case below
 * is a different person looking at the same booking.
 */
describe('bookingService.daySchedule — booker visibility', () => {
  const hall: ResourceAvailabilityRow = {
    ...laser,
    id: '93ffabe1-51aa-4551-bb99-02a6251740dd',
    name: 'Event Hall',
    kind: 'room',
  };

  const activeMember = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'ana@reyes.dev',
    role: 'member' as const,
    accessToken: 'token',
    isActiveMember: true,
  };

  const lapsed = { ...activeMember, isActiveMember: false, role: 'guest' as const };

  function bookingBy(fullName: string, directoryVisible: boolean) {
    return [
      {
        resource_id: hall.id,
        starts_at: '2026-08-13T18:00:00+00:00',
        ends_at: '2026-08-13T19:00:00+00:00',
        profiles: { full_name: fullName, directory_visible: directoryVisible },
      },
    ];
  }

  beforeEach(() => {
    vi.mocked(resourceRepository.list).mockResolvedValue([hall]);
    vi.mocked(resourceRepository.busyRangesFor).mockResolvedValue(bookingBy('Ana Reyes', true));
  });

  it('names the booker for an active member', async () => {
    const [row] = await bookingService.daySchedule('room', '2026-08-13', activeMember);

    expect(row?.bookedBy).toBe('Ana Reyes');
    expect(row?.resourceName).toBe('Event Hall');
  });

  it('withholds the name from an anonymous caller', async () => {
    const [row] = await bookingService.daySchedule('room', '2026-08-13', undefined);

    // Absent, not blanked: the name never leaves the server.
    expect(row?.bookedBy).toBeNull();
    // The reservation itself still shows — the room really is taken.
    expect(row?.window).toBeTruthy();
  });

  it('withholds the name from a signed-in but lapsed member', async () => {
    const [row] = await bookingService.daySchedule('room', '2026-08-13', lapsed);

    expect(row?.bookedBy).toBeNull();
  });

  /**
   * Someone who opted out of the directory did not opt into being locatable by
   * which room they are sitting in.
   */
  it('hides the name of a member who is not directory-visible', async () => {
    vi.mocked(resourceRepository.busyRangesFor).mockResolvedValue(bookingBy('Ana Reyes', false));

    const [row] = await bookingService.daySchedule('room', '2026-08-13', activeMember);

    expect(row?.bookedBy).toBe('A member');
    expect(row?.bookedBy).not.toContain('Ana');
  });

  it('never leaks a booking id or reference to anyone', async () => {
    const [row] = await bookingService.daySchedule('room', '2026-08-13', activeMember);

    expect(row).not.toHaveProperty('id');
    expect(row).not.toHaveProperty('reference');
    expect(row).not.toHaveProperty('profileId');
  });
});
