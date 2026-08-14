/**
 * The Dojo's wall clock.
 *
 * `resources.opens_at` / `closes_at` are Postgres `time` values. A `time` has no
 * zone, so it only means something once someone decides which one — and the two
 * places that decided previously disagreed: the slot builder used
 * `setUTCHours`, and `validate_booking` cast `starts_at::time` under the
 * connection's timezone, which is UTC for PostgREST. Both said "09:00" and both
 * meant 02:00 in Mountain View.
 *
 * Every conversion between a wall-clock hour in the space and an instant now
 * goes through this module, and `dojoTimezone()` returns the same string the
 * `public.dojo_timezone()` SQL function does. If the Dojo ever moves, the two
 * change together.
 *
 * Implementation note: this uses `Intl` rather than a date library. Node ships
 * the full ICU database, `Intl.DateTimeFormat` knows every DST transition, and
 * the alternative is a dependency that does the same lookup less directly.
 */

export const DOJO_TIMEZONE = 'America/Los_Angeles';

export function dojoTimezone(): string {
  return DOJO_TIMEZONE;
}

const PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: DOJO_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Break an instant into the wall-clock reading someone in the space would take. */
export function toDojoWallClock(instant: Date): WallClock {
  const parts = PARTS_FORMATTER.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0';
    return Number.parseInt(value, 10);
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // `hour12: false` renders midnight as 24 in some ICU versions.
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  };
}

/**
 * The UTC offset in minutes that the Dojo's zone had at a given instant.
 *
 * Derived rather than tabulated: format the instant in the zone, read it back as
 * if it were UTC, and the difference is the offset. That is correct across DST
 * transitions without hard-coding either -0700 or -0800.
 */
function offsetMinutesAt(instant: Date): number {
  const wall = toDojoWallClock(instant);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  // `asUtc` carries no milliseconds, so drop them from the instant too rather
  // than letting a sub-second remainder turn the offset into a fraction.
  const whole = instant.getTime() - instant.getUTCMilliseconds();
  return Math.round((asUtc - whole) / 60_000);
}

/**
 * The instant at which a given wall-clock reading occurs in the Dojo's zone.
 *
 * Solved iteratively because the offset depends on the answer: guess with the
 * offset at the naive instant, then correct once using the offset at the guess.
 * One correction is always enough — a second pass only ever matters inside the
 * one ambiguous hour a year, which the clamp below resolves the same way
 * Postgres does (the earlier of the two readings).
 */
export function fromDojoWallClock(wall: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}): Date {
  const naive = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour ?? 0,
    wall.minute ?? 0,
    wall.second ?? 0,
  );

  const firstGuess = new Date(naive - offsetMinutesAt(new Date(naive)) * 60_000);
  const corrected = new Date(naive - offsetMinutesAt(firstGuess) * 60_000);

  return corrected;
}

/** Parse a `YYYY-MM-DD` day into its components, or null when it is not one. */
export function parseIsoDate(day: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayOfMonth = Number(match[3]);

  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) return null;

  // Round-trip check: 2026-02-31 parses field-by-field but is not a date.
  const probe = new Date(Date.UTC(year, month - 1, dayOfMonth));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== dayOfMonth) return null;

  return { year, month, day: dayOfMonth };
}

/** `'09:00'` or `'09:00:00'` → minutes since local midnight. */
export function parseClockTime(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number.parseInt(hours, 10) * 60 + Number.parseInt(minutes, 10);
}

/** Minutes since midnight → the `HH:MM` label the booking grid renders. */
export function formatClockTime(minutesSinceMidnight: number): string {
  const hours = Math.floor(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * A human label for a booking, rendered in the Dojo's zone.
 *
 * Rendered server-side so the string a member reads in their reservation list
 * matches the slot they tapped, regardless of where their phone thinks it is —
 * a member travelling with the app open should not see their Saturday laser
 * booking described as Friday night.
 */
export function formatDojoRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: DOJO_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(start);

  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: DOJO_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${day} · ${time.format(start)} – ${time.format(end)}`;
}

/**
 * Just the clock window: `11:00 AM – 12:00 PM`.
 *
 * `formatDojoRange` leads with the weekday and date, which is right for a
 * reservation that could be any day. Where the day is already established by
 * context — a list headed "today" — repeating it on every row is noise that
 * pushes the times that matter to the right.
 */
export function formatDojoClockRange(startsAt: string, endsAt: string): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: DOJO_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${time.format(new Date(startsAt))} – ${time.format(new Date(endsAt))}`;
}

/** `YYYY-MM-DD` for the day it currently is in the space. */
export function dojoToday(now: Date = new Date()): string {
  const wall = toDojoWallClock(now);
  return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
}
