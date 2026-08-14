import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { notificationRepository } from '../repositories/notification.repository.js';
import { emailService, isEmailConfigured } from './email.service.js';
import { formatDojoRange } from '../utils/time.js';
import type { PushTargetRow } from '../types/database.js';

/**
 * Push notifications.
 *
 * Tokens were being stored and nothing ever sent to them: "Event announcements"
 * and "Weekly community digest" were switches wired to nothing, and only the
 * locally-scheduled booking reminder ever fired. This is the sender.
 *
 * Three properties matter and each is enforced here rather than assumed:
 *
 *   1. **Consent.** Every send filters on the member's own preference column.
 *      A member who turned events off is not in the audience, full stop.
 *   2. **Exactly once.** Every notification carries a dedupe key, and
 *      `push_deliveries` has a unique index on `(profile_id, dedupe_key)`. A
 *      retried digest is a unique violation, not a second buzz at 7am — the
 *      same guard the Stripe webhook uses.
 *   3. **Bounded fan-out.** Expo's API takes at most 100 messages per request,
 *      so the audience is chunked rather than sent in one call that would fail
 *      wholesale at 101 members.
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_MAX_BATCH = 100;
const REQUEST_TIMEOUT_MS = 15_000;

export type NotificationChannel = 'default' | 'bookings' | 'events' | 'digest';

export interface PushMessage {
  profileId: string;
  token: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  /** Stable per logical notification, e.g. `booking-reminder:<id>`. */
  dedupeKey: string;
  /** Routed by `useNotificationSetup` when the member taps the banner. */
  data?: Record<string, string>;
}

export interface SendReport {
  requested: number;
  sent: number;
  skipped: number;
  failed: number;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo rejects a token it no longer recognises with `DeviceNotRegistered`.
 * Keeping it would mean retrying a dead device forever, so it is cleared.
 */
const DEAD_TOKEN_ERROR = 'DeviceNotRegistered';

async function postToExpo(
  messages: Array<{ to: string; title: string; body: string; channelId: string; data?: unknown }>,
): Promise<ExpoTicket[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Expo requires the token once a project enables enhanced security, and
        // accepts it always — so it is sent unconditionally when configured.
        ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Expo push responded ${response.status}`);
    }

    const payload = (await response.json()) as { data?: ExpoTicket[] };
    return payload.data ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export const notificationService = {
  /**
   * Send a batch.
   *
   * The delivery row is claimed BEFORE the request goes out, so a crash between
   * send and record cannot produce a duplicate on the next run. A claim that
   * loses to the unique index means someone already sent this exact
   * notification, and the message is dropped.
   */
  async send(messages: PushMessage[]): Promise<SendReport> {
    const report: SendReport = { requested: messages.length, sent: 0, skipped: 0, failed: 0 };
    if (messages.length === 0) return report;

    const claimed: PushMessage[] = [];
    for (const message of messages) {
      const isNew = await notificationRepository.claimDelivery({
        profileId: message.profileId,
        dedupeKey: message.dedupeKey,
        channel: message.channel,
        title: message.title,
        body: message.body,
      });

      if (isNew) claimed.push(message);
      else report.skipped += 1;
    }

    if (claimed.length === 0) return report;

    // Without a token configured this is a no-op that still records intent, so
    // a local environment can exercise the whole path without sending anything
    // to a real device. Production refuses to boot without the token.
    if (!env.EXPO_ACCESS_TOKEN) {
      logger.warn(
        { count: claimed.length },
        'EXPO_ACCESS_TOKEN is unset — push recorded but not delivered',
      );
      for (const message of claimed) {
        await notificationRepository.markDelivery(message.profileId, message.dedupeKey, {
          status: 'failed',
          error: 'EXPO_ACCESS_TOKEN not configured',
        });
      }
      report.failed += claimed.length;
      return report;
    }

    for (const batch of chunk(claimed, EXPO_MAX_BATCH)) {
      let tickets: ExpoTicket[] = [];

      try {
        tickets = await postToExpo(
          batch.map((message) => ({
            to: message.token,
            title: message.title,
            body: message.body,
            channelId: message.channel,
            ...(message.data ? { data: message.data } : {}),
          })),
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.error({ err: error, size: batch.length }, 'Expo push request failed');

        for (const message of batch) {
          await notificationRepository.markDelivery(message.profileId, message.dedupeKey, {
            status: 'failed',
            error: reason,
          });
        }
        report.failed += batch.length;
        continue;
      }

      for (const [index, message] of batch.entries()) {
        const ticket = tickets[index];

        if (ticket?.status === 'ok') {
          await notificationRepository.markDelivery(message.profileId, message.dedupeKey, {
            status: 'sent',
            ticketId: ticket.id ?? null,
          });
          report.sent += 1;
          continue;
        }

        const detail = ticket?.details?.error ?? ticket?.message ?? 'unknown';
        await notificationRepository.markDelivery(message.profileId, message.dedupeKey, {
          status: 'failed',
          error: detail,
        });
        report.failed += 1;

        if (detail === DEAD_TOKEN_ERROR) {
          await notificationRepository.clearPushToken(message.profileId);
          logger.info({ profileId: message.profileId }, 'Cleared a push token Expo rejected');
        }
      }
    }

    return report;
  },

  /**
   * Email everyone about a new event.
   *
   * Separate from `announceEvent` below rather than folded into it, because the
   * two have different audiences: push can only reach a device that registered
   * a token, email reaches every profile. Merging them would mean either
   * emailing only the subset with push tokens, or pushing to people who have
   * none — both wrong.
   *
   * Sends one at a time and keeps going past failures. A bad address is one
   * member who misses one event; aborting the loop would silence everyone after
   * them in the list. The caller must not await this — see `fulfil`.
   */
  async emailEventAnnouncement(input: {
    title: string;
    startsAt: string;
    endsAt: string;
    roomName: string;
    hostName: string;
    description: string | null;
  }): Promise<SendReport> {
    if (!isEmailConfigured) {
      logger.warn({ title: input.title }, 'Email is not configured — event announcement not sent');
      return { requested: 0, sent: 0, skipped: 0, failed: 0 };
    }

    const audience = await notificationRepository.emailAudienceForEvents();
    const when = formatDojoRange(input.startsAt, input.endsAt);

    let sent = 0;
    let failed = 0;

    for (const person of audience) {
      try {
        const result = await emailService.sendEventAnnouncement({
          to: person.email,
          name: person.full_name,
          title: input.title,
          when,
          roomName: input.roomName,
          hostName: input.hostName,
          description: input.description,
        });
        if (result.delivered) sent += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        logger.warn({ error, to: person.email }, 'Event announcement email failed');
      }
    }

    logger.info(
      { title: input.title, requested: audience.length, sent, failed },
      'Event announcement emailed',
    );

    return { requested: audience.length, sent, skipped: 0, failed };
  },

  /** Announce a newly published event to everyone who asked for event news. */
  async announceEvent(input: {
    eventId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    roomName: string;
  }): Promise<SendReport> {
    const targets = await notificationRepository.audienceFor('events');

    return this.send(
      targets.map((target) => ({
        profileId: target.profile_id,
        token: target.push_token,
        channel: 'events' as const,
        title: input.title,
        body: `${formatDojoRange(input.startsAt, input.endsAt)} · ${input.roomName}`,
        dedupeKey: `event-announce:${input.eventId}`,
        data: { route: `/(app)/event/${input.eventId}` },
      })),
    );
  },

  /**
   * The Monday digest.
   *
   * The dedupe key carries the ISO week, so re-running the scheduler on a
   * Monday afternoon after a deploy does not send it twice.
   */
  async sendWeeklyDigest(input: { weekKey: string; eventCount: number }): Promise<SendReport> {
    const targets = await notificationRepository.audienceFor('weekly_digest');

    const body =
      input.eventCount === 0
        ? 'A quiet week on the calendar — the floor is all yours.'
        : `${input.eventCount} ${input.eventCount === 1 ? 'event' : 'events'} on the board this week.`;

    return this.send(
      targets.map((target) => ({
        profileId: target.profile_id,
        token: target.push_token,
        channel: 'digest' as const,
        title: 'This week at the Dojo',
        body,
        dedupeKey: `digest:${input.weekKey}`,
        data: { route: '/(app)/(tabs)/events' },
      })),
    );
  },

  /**
   * Booking reminders.
   *
   * The app already schedules a local notification when a booking is made, which
   * covers the offline case. This is the server-side twin for a member who
   * booked on another device or reinstalled since — the dedupe key is the
   * booking id, so the two can never both fire.
   */
  async sendBookingReminders(withinMinutes: number): Promise<SendReport> {
    const rows = await notificationRepository.upcomingBookingsNeedingReminder(withinMinutes);

    return this.send(
      rows.map((row) => ({
        profileId: row.profile_id,
        token: row.push_token,
        channel: 'bookings' as const,
        title: `${row.resource_name} in ${withinMinutes} minutes`,
        body: formatDojoRange(row.starts_at, row.ends_at),
        dedupeKey: `booking-reminder:${row.booking_id}`,
        data: { route: '/(app)/(tabs)/book' },
      })),
    );
  },

  /**
   * Membership reminders.
   *
   * Sent once per period end, keyed on the date rather than on "today", so a
   * member whose renewal is a week out is told once and not every day until it
   * lands.
   */
  async sendMembershipReminders(daysAhead: number): Promise<SendReport> {
    const rows = await notificationRepository.membershipsExpiringWithin(daysAhead);

    return this.send(
      rows.map((row) => ({
        profileId: row.profile_id,
        token: row.push_token,
        channel: 'default' as const,
        title: row.cancel_at_period_end
          ? 'Your membership ends soon'
          : 'Your membership renews soon',
        body: row.cancel_at_period_end
          ? 'Access ends at the close of this period. Reactivate any time from Settings.'
          : 'Your plan renews automatically. Manage it from Settings.',
        dedupeKey: `membership-reminder:${row.membership_id}:${row.current_period_end}`,
        data: { route: '/(app)/settings' },
      })),
    );
  },

  /** Exposed for the audience-shaped tests, which assert on consent filtering. */
  audienceOf(
    targets: PushTargetRow[],
    channel: 'events' | 'bookings' | 'weekly_digest',
  ): PushTargetRow[] {
    return targets.filter((target) => target[channel]);
  },
};
