import {
  formatCountdown,
  formatCurrency,
  greetingFor,
  initialsOf,
  nextDays,
  toDateKey,
} from '../format';

describe('formatCurrency', () => {
  it('drops the cents on a whole-dollar amount', () => {
    expect(formatCurrency(15000)).toBe('$150');
  });

  it('keeps the cents when the amount is not whole', () => {
    expect(formatCurrency(11250)).toBe('$112.50');
  });

  it('handles zero without rendering a negative sign', () => {
    expect(formatCurrency(0)).toBe('$0');
  });
});

describe('formatCountdown', () => {
  it('pads both fields to two digits', () => {
    expect(formatCountdown(65)).toBe('01:05');
  });

  it('clamps a negative remainder to zero rather than counting backwards', () => {
    expect(formatCountdown(-30)).toBe('00:00');
  });

  it('does not roll over past 60 minutes', () => {
    expect(formatCountdown(3661)).toBe('61:01');
  });
});

describe('initialsOf', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsOf('Priya Raman')).toBe('PR');
  });

  it('handles a single name', () => {
    expect(initialsOf('Wozniak')).toBe('W');
  });

  it('ignores a third name rather than producing a three-letter monogram', () => {
    expect(initialsOf('Ana Maria Reyes')).toBe('AM');
  });

  it('tolerates extra whitespace', () => {
    expect(initialsOf('  Diego   Salazar  ')).toBe('DS');
  });
});

describe('toDateKey', () => {
  it('formats in local time, not UTC', () => {
    // 23:30 local on the 5th is the 6th in UTC for positive offsets. The key
    // must follow the device's calendar day, since the API treats `day` as a
    // local date.
    const date = new Date(2026, 7, 5, 23, 30);
    expect(toDateKey(date)).toBe('2026-08-05');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toDateKey(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('nextDays', () => {
  it('returns consecutive days starting from the given date', () => {
    const days = nextDays(3, new Date(2026, 7, 5));
    expect(days.map((day) => day.key)).toEqual(['2026-08-05', '2026-08-06', '2026-08-07']);
  });

  it('rolls over a month boundary', () => {
    const days = nextDays(2, new Date(2026, 7, 31));
    expect(days.map((day) => day.key)).toEqual(['2026-08-31', '2026-09-01']);
  });
});

describe('greetingFor', () => {
  // Explicitly typed as a tuple array: `it.each` also has a tagged-template
  // overload, and a heterogeneous inline array makes TS pick the wrong one.
  const cases: Array<[Date, string]> = [
    [new Date(2026, 7, 5, 8), 'Morning'],
    [new Date(2026, 7, 5, 13), 'Afternoon'],
    [new Date(2026, 7, 5, 20), 'Evening'],
    // Boundaries: noon is afternoon, 18:00 is evening.
    [new Date(2026, 7, 5, 12), 'Afternoon'],
    [new Date(2026, 7, 5, 18), 'Evening'],
  ];

  it.each(cases)('returns the right greeting for %s', (date, expected) => {
    expect(greetingFor(date)).toBe(expected);
  });
});
