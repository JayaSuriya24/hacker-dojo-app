import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { XStack, YStack } from 'tamagui';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { radius, space } from '~/theme/tokens';

/**
 * Pick a date from a calendar.
 *
 * Typing `YYYY-MM-DD` asks someone to know both the format and what day of the
 * week their date lands on — and for a weekly event the weekday is the whole
 * point. A grid answers both without being told.
 *
 * Drawn here rather than pulled in: the platform pickers disagree (a wheel on
 * iOS, a dialog on Android, a browser control on web), none of them take the
 * app's theme, and this needs to look like the rest of the sheet on all three.
 */

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** `YYYY-MM-DD` in local time. `toISOString` would shift the day west of UTC. */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parsed as local midday, so no timezone can nudge it onto the day before. */
function fromDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

/** The days of `month`, padded with nulls so the 1st lands under its weekday. */
function monthGrid(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1, 12);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day, 12));
  }
  return cells;
}

export function DateField({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  /** `YYYY-MM-DD`. */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | undefined;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);

  const selected = fromDateKey(value);
  const [cursor, setCursor] = useState(() => selected ?? new Date());

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  }, []);

  const cells = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const summary = selected
    ? selected.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Choose a date';

  const step = (months: number) =>
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + months, 1, 12));

  return (
    <YStack gap={space[2]}>
      <Text variant="eyebrow" tone="subtle">
        {label}
      </Text>

      <Pressable
        onPress={() => setOpen((previous) => !previous)}
        role="button"
        aria-label={`${label}: ${summary}`}
        aria-expanded={open}
      >
        <XStack
          alignItems="center"
          gap={space[3]}
          paddingHorizontal={space[4]}
          paddingVertical={space[3]}
          borderWidth={1}
          borderColor={error ? palette.error : open ? palette.accent : palette.border}
          borderRadius={radius.md}
          backgroundColor="$surfaceAlt"
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"
              stroke={palette.textSubtle}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text variant="small" flex={1} textAlign="left">
            {summary}
          </Text>
        </XStack>
      </Pressable>

      {open ? (
        <YStack
          gap={space[3]}
          padding={space[4]}
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius={radius.md}
          backgroundColor="$surface"
        >
          <XStack alignItems="center" gap={space[3]}>
            <Pressable
              onPress={() => step(-1)}
              role="button"
              aria-label="Previous month"
              hitSlop={10}
            >
              <Text variant="title" tone="accent">
                ‹
              </Text>
            </Pressable>
            <Text variant="small" flex={1} center>
              {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
            </Text>
            <Pressable onPress={() => step(1)} role="button" aria-label="Next month" hitSlop={10}>
              <Text variant="title" tone="accent">
                ›
              </Text>
            </Pressable>
          </XStack>

          <XStack>
            {WEEKDAY_INITIALS.map((initial, index) => (
              <YStack key={`${initial}-${index}`} flex={1} alignItems="center">
                <Text variant="caption" tone="subtle" aria-hidden>
                  {initial}
                </Text>
              </YStack>
            ))}
          </XStack>

          {/* Six rows of seven keeps the grid a fixed height, so choosing a
              month with a leading Saturday does not make the sheet jump. */}
          {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
            <XStack key={row}>
              {cells.slice(row * 7, row * 7 + 7).map((date, column) => {
                if (!date) return <YStack key={`pad-${column}`} flex={1} />;

                const key = toDateKey(date);
                const isSelected = key === value;
                // A date in the past cannot be requested, so it is unpickable
                // rather than pickable-then-rejected by the validator.
                const isPast = date < today;

                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      if (isPast) return;
                      onChange(key);
                      setOpen(false);
                    }}
                    disabled={isPast}
                    role="button"
                    aria-label={date.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                    aria-selected={isSelected}
                    aria-disabled={isPast}
                    style={{ flex: 1 }}
                  >
                    <YStack
                      alignItems="center"
                      justifyContent="center"
                      height={40}
                      borderRadius={radius.sm}
                      backgroundColor={isSelected ? palette.accent : 'transparent'}
                    >
                      <Text
                        variant="small"
                        color={
                          isSelected ? palette.onAccent : isPast ? palette.textSubtle : palette.text
                        }
                        opacity={isPast ? 0.45 : 1}
                      >
                        {date.getDate()}
                      </Text>
                    </YStack>
                  </Pressable>
                );
              })}
            </XStack>
          ))}
        </YStack>
      ) : null}

      {error ? (
        <Text variant="caption" tone="error">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="subtle">
          {hint}
        </Text>
      ) : null}
    </YStack>
  );
}
