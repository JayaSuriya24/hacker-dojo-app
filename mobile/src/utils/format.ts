/**
 * Formatting helpers.
 *
 * Every one of these goes through `Intl`, which respects the device locale and
 * time zone. Hand-rolled formatting ("$" + cents/100) breaks for members whose
 * device is set to another region, and hard-coded time strings are wrong the
 * moment someone travels.
 */

/** Cents to a currency string. Money is integer cents everywhere — never a float. */
export function formatCurrency(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    // Whole dollars read cleaner in a pricing table; $112.50 keeps its cents.
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDayMonth(iso: string): { month: string; day: string } {
  const date = new Date(iso);
  return {
    month: date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    day: String(date.getDate()).padStart(2, '0'),
  };
}

export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const day = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${day} · ${formatTime(startIso)} – ${formatTime(endIso)}`;
}

/** "in 3 days", "2 hours ago" — via Intl.RelativeTimeFormat, so it localises. */
export function formatRelative(iso: string): string {
  const target = new Date(iso).getTime();
  const deltaSeconds = Math.round((target - Date.now()) / 1000);

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  for (const [unit, seconds] of units) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return formatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return formatter.format(deltaSeconds, 'second');
}

/** mm:ss for the live booth countdown. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** YYYY-MM-DD in the DEVICE's timezone — the API treats `day` as a local date. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The seven-day strip in the booking sheet. */
export function nextDays(
  count: number,
  from = new Date(),
): Array<{ date: Date; label: string; day: string; key: string }> {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(from);
    date.setDate(from.getDate() + index);
    return {
      date,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      day: String(date.getDate()).padStart(2, '0'),
      key: toDateKey(date),
    };
  });
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** "Morning" / "Afternoon" / "Evening" — the Home greeting. */
export function greetingFor(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}
