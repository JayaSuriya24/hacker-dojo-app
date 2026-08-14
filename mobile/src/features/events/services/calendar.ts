import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import { logger } from '~/services/logger';
import { dojo } from '~/constants/config';

/**
 * Putting an RSVP into the member's own calendar.
 *
 * This replaced a check-in badge: a QR-styled block the member held up at the
 * front desk. The badge only mattered in the ten seconds at the door, whereas
 * the thing someone actually wants after saying "I'm going" is not to forget.
 *
 * Everything written here comes from the event itself — no reminder times, no
 * invented location, no alarm. Guessing that someone wants a 30-minute alert is
 * the kind of helpfulness that ends up in a support thread.
 */

export interface CalendarEventInput {
  title: string;
  startsAt: string;
  endsAt: string;
  roomName: string;
  description: string | null;
}

export type CalendarOutcome =
  /**
   * `existing` means it was already on the calendar and nothing was written —
   * still a success from the member's point of view, and worth distinguishing
   * so the UI can say so rather than implying it just added a second copy.
   */
  | { ok: true; via: 'device' | 'download' | 'existing' }
  | { ok: false; reason: 'permission_denied' | 'no_calendar' | 'failed'; message: string };

/** Address of the building, so the calendar entry can route someone there. */
const LOCATION = `Hacker Dojo, ${dojo.addressLine1}, ${dojo.addressLine2}`;

/**
 * The calendar to write into.
 *
 * iOS exposes a real "default" calendar and that is the right target — it is
 * where the member's own events already live. Android has no such concept, so
 * the first writable, visible, non-holiday calendar is chosen instead; picking
 * blindly can land the event in a read-only birthdays or holidays feed, which
 * fails at write time with an error that explains nothing.
 */
async function writableCalendarId(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const fallback = await Calendar.getDefaultCalendarAsync().catch(() => null);
    if (fallback?.id) return fallback.id;
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

  const writable = calendars.find(
    (calendar) =>
      calendar.allowsModifications &&
      calendar.accessLevel !== Calendar.CalendarAccessLevel.READ &&
      // Holiday and birthday feeds report as modifiable on some Android OEM
      // builds and then reject the insert.
      calendar.source?.type !== Calendar.SourceType.BIRTHDAYS,
  );

  return writable?.id ?? null;
}

/**
 * Build an `.ics` file and hand it to the browser.
 *
 * `expo-calendar` is native-only — there is no web implementation, and calling
 * it there throws rather than degrading. A downloaded invite is the web's
 * equivalent gesture: every desktop calendar imports one on double-click.
 *
 * Line endings are CRLF and the UID is stable per event, both because RFC 5545
 * requires it and because Outlook silently ignores files that get either wrong.
 */
function downloadInvite(input: CalendarEventInput): CalendarOutcome {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, '');

  // Long lines must be folded at 75 octets; the description is the only field
  // here that realistically exceeds it.
  const escape = (value: string) =>
    value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hacker Dojo//Member App//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${stamp(input.startsAt)}-${escape(input.title).slice(0, 40)}@hackerdojo.org`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(input.startsAt)}`,
    `DTEND:${stamp(input.endsAt)}`,
    `SUMMARY:${escape(input.title)}`,
    `LOCATION:${escape(`${input.roomName} — ${LOCATION}`)}`,
    ...(input.description ? [`DESCRIPTION:${escape(input.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  try {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${input.title.replace(/[^\w\s-]/g, '').trim() || 'event'}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { ok: true, via: 'download' };
  } catch (error) {
    logger.warn('Could not build the calendar invite', { error });
    return { ok: false, reason: 'failed', message: 'Could not build a calendar invite.' };
  }
}

/**
 * Add the event, returning WHY it failed rather than throwing.
 *
 * The caller renders the reason and offers a retry, and each of these needs a
 * different sentence: a denied permission is fixed in Settings, no writable
 * calendar is fixed by adding an account, and a failed write is worth simply
 * trying again.
 */
export async function addEventToCalendar(input: CalendarEventInput): Promise<CalendarOutcome> {
  if (Platform.OS === 'web') return downloadInvite(input);

  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();

    if (status !== 'granted') {
      return {
        ok: false,
        reason: 'permission_denied',
        message: 'Calendar access is off. Turn it on in Settings, then try again.',
      };
    }

    const calendarId = await writableCalendarId();
    if (!calendarId) {
      return {
        ok: false,
        reason: 'no_calendar',
        message: 'No calendar on this device can be written to. Add one, then try again.',
      };
    }

    /*
     * Don't add it twice.
     *
     * The button disables itself after a success, but that state dies with the
     * sheet: reopening the event and tapping again would otherwise write a
     * second identical entry, and a calendar with the same meeting in it twice
     * is a thing people notice and have to clean up by hand.
     *
     * Matched on the exact start instant and title rather than an id, because
     * the id belongs to the device's calendar and we have nowhere to keep it.
     * The window is the event's own span, so an unrelated entry at another time
     * cannot collide.
     */
    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);

    const existing = await Calendar.getEventsAsync([calendarId], start, end).catch(() => []);
    const already = existing.some(
      (entry) =>
        entry.title === input.title && new Date(entry.startDate).getTime() === start.getTime(),
    );

    if (already) return { ok: true, via: 'existing' };

    await Calendar.createEventAsync(calendarId, {
      title: input.title,
      startDate: start,
      endDate: end,
      location: `${input.roomName} — ${LOCATION}`,
      ...(input.description ? { notes: input.description } : {}),
      // The event's own zone, not the device's: it happens at noon in Mountain
      // View wherever the phone happens to be.
      timeZone: dojo.timezone,
    });

    return { ok: true, via: 'device' };
  } catch (error) {
    logger.warn('Could not add the event to the calendar', { error });
    return {
      ok: false,
      reason: 'failed',
      message: 'Could not add it to your calendar. Try again.',
    };
  }
}
