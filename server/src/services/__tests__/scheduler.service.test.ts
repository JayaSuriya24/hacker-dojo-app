import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schedulerService } from '../scheduler.service.js';
import { notificationService } from '../notification.service.js';
import { eventRepository } from '../../repositories/event.repository.js';

/**
 * The weekly digest's event count.
 *
 * `maybeSendDigest` passed a hardcoded `eventCount: 0`, so every digest ever
 * sent read "A quiet week on the calendar — the floor is all yours", including
 * weeks with a full calendar. `sendWeeklyDigest` has always carried the plural
 * branch; production could never reach it.
 *
 * These assert the count is REAL and that it is measured over the same week the
 * dedupe key names.
 */

vi.mock('../notification.service.js', () => ({
  notificationService: {
    sendWeeklyDigest: vi.fn(async () => ({ requested: 1, sent: 1, skipped: 0, failed: 0 })),
    sendBookingReminders: vi.fn(),
    sendMembershipReminders: vi.fn(),
  },
}));

vi.mock('../../repositories/event.repository.js', () => ({
  eventRepository: { countPublishedBetween: vi.fn() },
}));

vi.mock('../../repositories/staff.repository.js', () => ({
  occupancyRepository: { sample: vi.fn(), prune: vi.fn(), endExpiredSessions: vi.fn() },
}));

vi.mock('../../repositories/eventSeries.repository.js', () => ({
  eventSeriesRepository: { generateAll: vi.fn() },
}));

/** Monday 2026-09-07, 09:00 in the Dojo's zone — when the digest fires. */
const MONDAY_9AM = new Date('2026-09-07T16:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(eventRepository.countPublishedBetween).mockResolvedValue(0);
});

describe('schedulerService.maybeSendDigest', () => {
  it('sends the REAL count, not a hardcoded zero', async () => {
    vi.mocked(eventRepository.countPublishedBetween).mockResolvedValue(4);

    await schedulerService.maybeSendDigest(MONDAY_9AM);

    expect(notificationService.sendWeeklyDigest).toHaveBeenCalledWith(
      expect.objectContaining({ eventCount: 4 }),
    );
  });

  it.each([
    [0, 'a genuinely quiet week'],
    [1, 'a single event'],
    [7, 'several events'],
  ])('passes through a count of %i (%s)', async (count) => {
    vi.mocked(eventRepository.countPublishedBetween).mockResolvedValue(count);

    await schedulerService.maybeSendDigest(MONDAY_9AM);

    expect(notificationService.sendWeeklyDigest).toHaveBeenCalledWith(
      expect.objectContaining({ eventCount: count }),
    );
  });

  it('counts the same week the dedupe key names', async () => {
    await schedulerService.maybeSendDigest(MONDAY_9AM);

    const [from, to] = vi.mocked(eventRepository.countPublishedBetween).mock.calls[0] as [
      string,
      string,
    ];

    // Monday 00:00 → the following Monday 00:00, Dojo time (PDT, UTC-7).
    expect(from).toBe('2026-09-07T07:00:00.000Z');
    expect(to).toBe('2026-09-14T07:00:00.000Z');

    expect(notificationService.sendWeeklyDigest).toHaveBeenCalledWith(
      expect.objectContaining({ weekKey: '2026-W37' }),
    );
  });

  it('does not count or send outside the digest window', async () => {
    // Tuesday morning — the digest only fires Monday at 09:00 Dojo time.
    const sent = await schedulerService.maybeSendDigest(new Date('2026-09-08T16:00:00Z'));

    expect(sent).toBe(false);
    expect(eventRepository.countPublishedBetween).not.toHaveBeenCalled();
    expect(notificationService.sendWeeklyDigest).not.toHaveBeenCalled();
  });

  it('still sends on a quiet week rather than skipping it', async () => {
    vi.mocked(eventRepository.countPublishedBetween).mockResolvedValue(0);

    const sent = await schedulerService.maybeSendDigest(MONDAY_9AM);

    // Zero events is a digest that says so, not a digest withheld.
    expect(sent).toBe(true);
    expect(notificationService.sendWeeklyDigest).toHaveBeenCalledOnce();
  });
});
