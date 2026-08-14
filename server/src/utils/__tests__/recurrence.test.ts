import { describe, expect, it } from 'vitest';
import { describeRecurrence } from '../recurrence.js';

const base = {
  interval_weeks: 1,
  weekdays: [2],
  until_date: null as string | null,
  max_occurrences: null as number | null,
  timezone: 'America/Los_Angeles',
};

describe('describeRecurrence', () => {
  it('reads back the rule in the screenshot', () => {
    expect(describeRecurrence({ ...base, until_date: '2026-08-25' })).toBe(
      'Every week on Tuesday until August 25, 2026',
    );
  });

  it('says nothing about an end when the series has none', () => {
    // A meetup that simply keeps happening is the normal case; "forever" would
    // be noise.
    expect(describeRecurrence(base)).toBe('Every week on Tuesday');
  });

  it('names a fortnightly cadence rather than saying "every 2 weeks"', () => {
    expect(describeRecurrence({ ...base, interval_weeks: 2 })).toBe('Every other week on Tuesday');
  });

  it('counts longer intervals plainly', () => {
    expect(describeRecurrence({ ...base, interval_weeks: 3 })).toBe('Every 3 weeks on Tuesday');
  });

  it('lists several weekdays in week order, not the order they were stored', () => {
    expect(describeRecurrence({ ...base, weekdays: [5, 1, 3] })).toBe(
      'Every week on Monday, Wednesday and Friday',
    );
  });

  it('joins exactly two weekdays with "and"', () => {
    expect(describeRecurrence({ ...base, weekdays: [2, 4] })).toBe(
      'Every week on Tuesday and Thursday',
    );
  });

  it('reports a bounded series by its count', () => {
    expect(describeRecurrence({ ...base, max_occurrences: 6 })).toBe(
      'Every week on Tuesday, 6 times',
    );
  });

  /**
   * A plain date read as UTC and printed on the US west coast lands on the day
   * before. The end of a series is a date, not an instant, so it is formatted
   * in the series' own zone from midday to keep it clear of both edges.
   */
  it('does not shift the end date backwards in a western timezone', () => {
    expect(describeRecurrence({ ...base, until_date: '2026-01-01' })).toContain('January 1, 2026');
  });

  it('ignores a weekday outside 0-6 rather than printing undefined', () => {
    expect(describeRecurrence({ ...base, weekdays: [2, 9] })).toBe('Every week on Tuesday');
  });
});
