import { describe, expect, it } from 'vitest';
import {
  DOJO_TIMEZONE,
  dojoToday,
  formatClockTime,
  formatDojoRange,
  fromDojoWallClock,
  parseClockTime,
  parseIsoDate,
  toDojoWallClock,
} from '../time.js';

/**
 * The Dojo clock.
 *
 * These are the tests that would have caught the original bug. Every case fixes
 * a real instant against a real wall-clock reading rather than asserting that
 * two derived values agree — an implementation that was consistently an hour
 * out would satisfy the latter.
 */
describe('fromDojoWallClock', () => {
  it('resolves a winter morning at PST (-08:00)', () => {
    const instant = fromDojoWallClock({ year: 2026, month: 1, day: 15, hour: 9 });
    expect(instant.toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  it('resolves a summer morning at PDT (-07:00)', () => {
    const instant = fromDojoWallClock({ year: 2026, month: 7, day: 15, hour: 9 });
    expect(instant.toISOString()).toBe('2026-07-15T16:00:00.000Z');
  });

  /**
   * The spring-forward gap. 02:00–03:00 local does not exist on this date, and
   * the naive-offset approach lands an hour out on either side of it if the
   * correction pass is missing.
   */
  it('is correct on either side of the spring-forward transition', () => {
    // 2026-03-08 is the US DST change: 02:00 PST becomes 03:00 PDT.
    const before = fromDojoWallClock({ year: 2026, month: 3, day: 8, hour: 1 });
    const after = fromDojoWallClock({ year: 2026, month: 3, day: 8, hour: 4 });

    expect(before.toISOString()).toBe('2026-03-08T09:00:00.000Z');
    expect(after.toISOString()).toBe('2026-03-08T11:00:00.000Z');
  });

  it('is correct on either side of the fall-back transition', () => {
    // 2026-11-01: 02:00 PDT becomes 01:00 PST.
    const before = fromDojoWallClock({ year: 2026, month: 11, day: 1, hour: 0 });
    const after = fromDojoWallClock({ year: 2026, month: 11, day: 1, hour: 4 });

    expect(before.toISOString()).toBe('2026-11-01T07:00:00.000Z');
    expect(after.toISOString()).toBe('2026-11-01T12:00:00.000Z');
  });

  it('round-trips through toDojoWallClock', () => {
    const wall = { year: 2026, month: 8, day: 5, hour: 14, minute: 30, second: 0 };
    const readBack = toDojoWallClock(fromDojoWallClock(wall));

    expect(readBack).toEqual(wall);
  });

  it('rolls a day-overflow forward, which the availability grid relies on', () => {
    // The slot builder asks for `day + 1` to get the end of the day.
    const instant = fromDojoWallClock({ year: 2026, month: 1, day: 31 + 1, hour: 0 });
    expect(toDojoWallClock(instant)).toMatchObject({ year: 2026, month: 2, day: 1, hour: 0 });
  });
});

describe('parseIsoDate', () => {
  it('accepts a well-formed day', () => {
    expect(parseIsoDate('2026-08-05')).toEqual({ year: 2026, month: 8, day: 5 });
  });

  it('rejects a day that parses field-by-field but is not a date', () => {
    expect(parseIsoDate('2026-02-31')).toBeNull();
  });

  it.each(['', '2026-8-5', '05-08-2026', 'yesterday', '2026-13-01'])('rejects %j', (value) => {
    expect(parseIsoDate(value)).toBeNull();
  });
});

describe('clock times', () => {
  it('parses a Postgres time with and without seconds', () => {
    expect(parseClockTime('09:00')).toBe(540);
    expect(parseClockTime('09:00:00')).toBe(540);
    expect(parseClockTime('21:30:00')).toBe(1290);
  });

  it('formats minutes back to a padded label', () => {
    expect(formatClockTime(540)).toBe('09:00');
    expect(formatClockTime(1290)).toBe('21:30');
    expect(formatClockTime(0)).toBe('00:00');
  });
});

describe('formatDojoRange', () => {
  /**
   * Rendered server-side precisely so it does NOT follow the reader's device: a
   * member travelling with the app open should still see their Saturday laser
   * booking described as Saturday.
   */
  it('renders in the Dojo zone regardless of the process timezone', () => {
    const label = formatDojoRange('2026-07-15T16:00:00.000Z', '2026-07-15T18:00:00.000Z');

    expect(label).toContain('9:00');
    expect(label).toContain('11:00');
    expect(label).toContain('Jul 15');
  });
});

describe('dojoToday', () => {
  it('reports the local day, not the UTC one', () => {
    // 05:30Z on the 6th is 22:30 on the 5th in Mountain View (PDT, -07).
    expect(dojoToday(new Date('2026-08-06T05:30:00.000Z'))).toBe('2026-08-05');
    // And an hour and a half later it really is the 6th in both.
    expect(dojoToday(new Date('2026-08-06T07:30:00.000Z'))).toBe('2026-08-06');
  });
});

describe('DOJO_TIMEZONE', () => {
  it('matches the value public.dojo_timezone() returns', () => {
    // Both sides of the wire have to agree or the trigger and the slot grid
    // disagree again, which is the bug this module exists to close.
    expect(DOJO_TIMEZONE).toBe('America/Los_Angeles');
  });
});
