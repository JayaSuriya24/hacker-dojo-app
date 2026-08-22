import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { occupancyRepository } from '../repositories/staff.repository.js';
import { eventSeriesRepository } from '../repositories/eventSeries.repository.js';
import { eventRepository } from '../repositories/event.repository.js';
import { notificationService } from './notification.service.js';
import { dojoWeekWindow, toDojoWallClock } from '../utils/time.js';

/**
 * Background work.
 *
 * Three things need to happen on a clock and nothing was doing any of them:
 * `occupancy_samples` had no writer, so the Home dial was frozen on seed data;
 * booking reminders only existed as a local notification scheduled on the
 * device; and the weekly digest was a preference switch with no sender.
 *
 * This is a plain interval rather than a job queue on purpose. The work is
 * idempotent (occupancy appends a sample, both senders dedupe on a key), it is
 * measured in milliseconds, and a queue would be a second piece of
 * infrastructure to operate for three timers. What it does need is
 * `RUN_SCHEDULER`, so that scaling the API to two instances does not double the
 * samples and the sends.
 */

/** How far ahead a booking reminder fires. Matches the copy in Settings. */
const BOOKING_REMINDER_MINUTES = 15;

/** How far ahead a membership renewal notice fires. */
const MEMBERSHIP_REMINDER_DAYS = 3;

/** The digest goes out on Monday morning, local time. */
const DIGEST_WEEKDAY = 1;
const DIGEST_HOUR = 9;

type Timer = ReturnType<typeof setInterval>;

/** ISO-8601 week key, so a re-run inside the same week is deduped, not resent. */
export function isoWeekKey(instant: Date): string {
  const wall = toDojoWallClock(instant);
  const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));

  // Thursday of the current week determines the ISO year.
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);

  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Never let a scheduled task's failure take the process down. */
async function guard(name: string, task: () => Promise<unknown>): Promise<void> {
  try {
    const result = await task();
    logger.debug({ task: name, result }, 'Scheduled task finished');
  } catch (error) {
    logger.error({ err: error, task: name }, 'Scheduled task failed');
  }
}

export const schedulerService = {
  /** Append one occupancy sample per zone, then trim the history. */
  async sampleOccupancy(): Promise<number> {
    // Before counting, close the sessions that have run out. They are already
    // excluded from the count, so this does not change the sample — it stops
    // them holding the one-live-session-per-member index slot, which is what
    // otherwise locks a member out of checking in the next day.
    const closed = await occupancyRepository.endExpiredSessions();
    if (closed > 0) logger.info({ closed }, 'Closed expired sessions');

    const zones = await occupancyRepository.sample();

    // Pruning is cheap and only matters occasionally; running it on the same
    // tick avoids a second timer for a delete that touches nothing most times.
    if (Math.random() < 0.02) {
      await occupancyRepository.prune();
    }

    return zones;
  },

  async sendDueReminders(): Promise<void> {
    await notificationService.sendBookingReminders(BOOKING_REMINDER_MINUTES);
    await notificationService.sendMembershipReminders(MEMBERSHIP_REMINDER_DAYS);
  },

  /**
   * The digest, if it is Monday morning in Mountain View.
   *
   * The hour check is deliberately loose — the dedupe key is the ISO week, so
   * firing on several ticks inside the same hour sends once. That is a better
   * trade than a cron expression that misses the window entirely if the process
   * restarts at 9:01.
   */
  async maybeSendDigest(now: Date = new Date()): Promise<boolean> {
    const wall = toDojoWallClock(now);
    const weekday = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();

    if (weekday !== DIGEST_WEEKDAY || wall.hour !== DIGEST_HOUR) return false;

    const weekKey = isoWeekKey(now);

    /*
     * The number the digest quotes.
     *
     * This was a hardcoded `0`, so every digest ever sent said "A quiet week on
     * the calendar — the floor is all yours", including weeks with a full
     * calendar. `sendWeeklyDigest` has always had the plural branch; nothing
     * could reach it.
     *
     * The window is the same ISO week `weekKey` names — Monday 00:00 to the
     * following Monday 00:00 in the Dojo's zone — so the message and its dedupe
     * key describe the same seven days.
     */
    const week = dojoWeekWindow(now);
    const eventCount = await eventRepository.countPublishedBetween(week.startsAt, week.endsAt);

    const report = await notificationService.sendWeeklyDigest({ weekKey, eventCount });

    logger.info({ weekKey, eventCount, ...report }, 'Weekly digest dispatched');
    return true;
  },

  /**
   * Materialise upcoming dates for every active series.
   *
   * Idempotent by the unique index on `(series_id, occurrence_date)`, so
   * running it on a timer cannot produce a second copy of next Tuesday — and a
   * missed tick costs nothing, because the next one generates the same set.
   */
  async generateSeriesOccurrences(): Promise<number> {
    const created = await eventSeriesRepository.generateAll();
    if (created > 0) logger.info({ created }, 'Generated event occurrences');
    return created;
  },

  /**
   * Start the timers.
   *
   * Returns a stop function so the process can drain cleanly on SIGTERM rather
   * than being killed mid-write, and so tests can start and stop it without a
   * lingering handle keeping the run alive.
   */
  start(): () => void {
    if (!env.RUN_SCHEDULER) {
      logger.info('Scheduler disabled on this instance (RUN_SCHEDULER=false)');
      return () => undefined;
    }

    const timers: Timer[] = [];

    const every = (ms: number, name: string, task: () => Promise<unknown>): void => {
      const timer = setInterval(() => void guard(name, task), ms);
      // Do not hold the event loop open: a shutdown should not wait for a tick.
      timer.unref();
      timers.push(timer);
    };

    every(env.OCCUPANCY_SAMPLE_INTERVAL_MS, 'occupancy', () => this.sampleOccupancy());
    every(60_000, 'reminders', () => this.sendDueReminders());
    every(15 * 60_000, 'digest', () => this.maybeSendDigest());
    // Hourly is ample for a horizon measured in months; it exists so an
    // open-ended weekly series keeps producing dates without anyone
    // remembering to top it up.
    every(60 * 60_000, 'event-series', () => this.generateSeriesOccurrences());

    logger.info({ occupancyIntervalMs: env.OCCUPANCY_SAMPLE_INTERVAL_MS }, 'Scheduler started');

    return () => {
      for (const timer of timers) clearInterval(timer);
      logger.info('Scheduler stopped');
    };
  },
};
