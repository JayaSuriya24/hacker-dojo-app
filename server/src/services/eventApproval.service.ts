import { eventAuthoringRepository } from '../repositories/eventAuthoring.repository.js';
import { eventSeriesRepository } from '../repositories/eventSeries.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { fromDojoWallClock, parseIsoDate, parseClockTime } from '../utils/time.js';
import { logger } from '../config/logger.js';
import { notificationService } from './notification.service.js';
import { AppError } from '../utils/errors.js';
import type { EventRequestRow } from '../types/database.js';

/**
 * Turning an approved request into something on the calendar.
 *
 * This is the step that never existed. A member filled the host form, a row
 * landed in `event_requests`, a steward could mark it accepted — and the events
 * table was never touched, so the request was a dead end with a reference
 * number. Approval now produces the event the member asked for.
 *
 * What it produces depends on what the host asked for:
 *
 *   · `once`   — one event on the preferred date.
 *   · `weekly` — an `event_series`, whose occurrences the generator expands and
 *                the hourly job keeps topped up.
 */

export interface ApprovalResult {
  kind: 'once' | 'weekly' | 'already_fulfilled';
  eventId?: string;
  seriesId?: string;
  occurrencesCreated?: number;
}

/** The instant a wall-clock date and time correspond to at the Dojo. */
function instantFor(day: string, time: string): Date {
  const parsed = parseIsoDate(day);
  if (!parsed) throw AppError.badRequest('That date is not one this server understands.');

  const minutes = parseClockTime(time);
  return fromDojoWallClock({
    year: parsed.year,
    month: parsed.month,
    day: parsed.day,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
  });
}

/**
 * Announce a new event without letting the announcement affect the approval.
 *
 * Deliberately NOT awaited by the caller. Mailing the whole membership is a
 * loop of network calls, and a steward tapping approve should not wait on it —
 * worse, a mail provider outage must not roll back or fail an approval whose
 * event is already on the calendar. Errors are logged and go no further.
 *
 * The event exists and the request is marked fulfilled before this runs, so the
 * worst case is a real event nobody was emailed about, which a steward can see
 * and act on. The opposite ordering risks emailing about an event that then
 * failed to save.
 */
function announce(input: {
  title: string;
  startsAt: string;
  endsAt: string;
  roomName: string;
  hostName: string;
  description: string | null;
}): void {
  void notificationService
    .emailEventAnnouncement(input)
    .catch((error: unknown) =>
      logger.error({ err: error, title: input.title }, 'Event announcement emails failed'),
    );
}

export const eventApprovalService = {
  /**
   * Create the event(s) a request describes.
   *
   * Idempotent by the `created_event_id` / `created_series_id` written back
   * onto the request: a steward tapping approve twice on a slow connection gets
   * the same answer rather than a second copy of the meetup.
   */
  async fulfil(request: EventRequestRow): Promise<ApprovalResult> {
    if (request.created_event_id || request.created_series_id) {
      return {
        kind: 'already_fulfilled',
        ...(request.created_event_id ? { eventId: request.created_event_id } : {}),
        ...(request.created_series_id ? { seriesId: request.created_series_id } : {}),
      };
    }

    // The host's own name goes on the event, not the steward's — they are the
    // one standing at the front of the room.
    const host = await profileRepository.findById(request.profile_id);

    /**
     * The room decides how many fit, not the host's guess.
     *
     * Asking someone to predict attendance before they have advertised anything
     * produced a number that then became a hard cap — a member turned away from
     * a half-empty hall because the host wrote 20. `expected_size` survives as
     * the fallback for a room we do not hold a seat count for.
     */
    const seats = await eventAuthoringRepository.roomCapacity(request.preferred_room);

    const template = {
      title: request.title,
      category: request.category,
      hostName: host?.full_name ?? 'Hacker Dojo',
      hostProfileId: request.profile_id,
      roomName: request.preferred_room,
      capacity: seats ?? request.expected_size,
      notes: request.notes,
    };

    if (request.repeat_mode === 'weekly') {
      const series = await eventAuthoringRepository.createSeries({
        template,
        startsOn: request.preferred_date,
        startsTime: request.preferred_time,
        durationMinutes: request.duration_minutes,
        weekdays: request.repeat_weekdays,
        intervalWeeks: request.repeat_interval_weeks,
        untilDate: request.repeat_until,
      });

      // Written back before generating: if expansion fails, the series still
      // exists and the hourly job will fill it, and a retried approval must not
      // create a second one.
      await eventAuthoringRepository.markRequestFulfilled(request.id, { seriesId: series.id });

      const occurrencesCreated = await eventSeriesRepository.generate(series.id);
      logger.info(
        { requestId: request.id, seriesId: series.id, occurrencesCreated },
        'Approved a recurring event request',
      );

      const firstStart = instantFor(request.preferred_date, request.preferred_time);
      announce({
        title: template.title,
        startsAt: firstStart.toISOString(),
        endsAt: new Date(firstStart.getTime() + request.duration_minutes * 60_000).toISOString(),
        roomName: template.roomName,
        hostName: template.hostName,
        description: template.notes,
      });

      return { kind: 'weekly', seriesId: series.id, occurrencesCreated };
    }

    const startsAt = instantFor(request.preferred_date, request.preferred_time);
    const endsAt = new Date(startsAt.getTime() + request.duration_minutes * 60_000);

    const event = await eventAuthoringRepository.createEvent({
      template,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    });

    await eventAuthoringRepository.markRequestFulfilled(request.id, { eventId: event.id });
    logger.info({ requestId: request.id, eventId: event.id }, 'Approved a one-off event request');

    announce({
      title: template.title,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      roomName: template.roomName,
      hostName: template.hostName,
      description: template.notes,
    });

    return { kind: 'once', eventId: event.id };
  },
};
