import type { EventSeriesRow } from '../types/database.js';

/**
 * Turning a recurrence rule into a sentence.
 *
 * Server-side because it is a statement about the schedule, and the schedule is
 * the server's to describe — the same rule must read identically on iOS, on
 * Android and in the welcome email, and none of those should be assembling it
 * from parts. The client renders the string it is handed.
 */

/** Index is Postgres `dow`: 0 = Sunday … 6 = Saturday. */
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** "Tuesday", "Tuesday and Thursday", "Monday, Wednesday and Friday". */
function listWeekdays(weekdays: number[]): string {
  const names = [...new Set(weekdays)]
    .filter((day) => day >= 0 && day <= 6)
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_NAMES[day] as string);

  if (names.length === 0) return '';
  if (names.length === 1) return names[0] as string;

  const last = names[names.length - 1] as string;
  return `${names.slice(0, -1).join(', ')} and ${last}`;
}

function cadence(intervalWeeks: number): string {
  if (intervalWeeks === 1) return 'Every week';
  if (intervalWeeks === 2) return 'Every other week';
  return `Every ${intervalWeeks} weeks`;
}

/**
 * The rule as a sentence, e.g. "Every week on Tuesday until August 25, 2026".
 *
 * The end clause is omitted entirely for an open-ended series rather than
 * rendered as "forever" — a meetup that simply keeps happening is the normal
 * case, and saying so adds nothing.
 *
 * `until_date` is formatted in the series' own zone. Reading a plain date back
 * as UTC and printing it locally is how "until August 25" becomes "until
 * August 24" for anyone west of Greenwich.
 */
export function describeRecurrence(
  series: Pick<
    EventSeriesRow,
    'interval_weeks' | 'weekdays' | 'until_date' | 'max_occurrences' | 'timezone'
  >,
): string {
  const days = listWeekdays(series.weekdays);
  const opening = days
    ? `${cadence(series.interval_weeks)} on ${days}`
    : cadence(series.interval_weeks);

  if (series.until_date) {
    const until = new Date(`${series.until_date}T12:00:00Z`).toLocaleDateString('en-US', {
      timeZone: series.timezone,
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    return `${opening} until ${until}`;
  }

  if (series.max_occurrences) {
    return `${opening}, ${series.max_occurrences} times`;
  }

  return opening;
}
