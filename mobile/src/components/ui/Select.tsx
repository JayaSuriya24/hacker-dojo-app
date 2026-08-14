import { useState } from 'react';
import { Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ScrollView, XStack, YStack } from 'tamagui';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { radius, space } from '~/theme/tokens';

/**
 * A dropdown.
 *
 * The list expands in place rather than floating above the screen: a popover
 * needs a portal and an overlay that behave differently on iOS, Android and
 * web, and this is used inside a scrolling form sheet where a floating layer is
 * exactly the thing that ends up clipped or misplaced. Pushing the fields below
 * it down is honest about what happened and works identically everywhere.
 *
 * The list is capped and scrolls, so an hours picker with twelve entries does
 * not push the submit button off the sheet.
 */

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

/** Roughly five rows before the list scrolls. */
const MAX_LIST_HEIGHT = 208;

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  hideLabel,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  hint?: string;
  error?: string | undefined;
  /**
   * Hide the printed label without dropping it.
   *
   * For a control whose meaning is already carried by a heading above it — an
   * hour and a minute under "Start time" — the word is visual noise. It stays
   * on `aria-label` regardless, because a screen reader that announces only
   * "7" has told the listener nothing.
   */
  hideLabel?: boolean;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);

  return (
    <YStack gap={space[2]}>
      {hideLabel ? null : (
        <Text variant="eyebrow" tone="subtle">
          {label}
        </Text>
      )}

      <Pressable
        onPress={() => setOpen((previous) => !previous)}
        role="button"
        aria-label={`${label}: ${selected?.label ?? 'not set'}`}
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
          <Text variant="small" flex={1} textAlign="left">
            {selected?.label ?? '—'}
          </Text>
          {/* Chevron, rotated when open so the control says which way it goes. */}
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}
              stroke={palette.textSubtle}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </XStack>
      </Pressable>

      {open ? (
        <YStack
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius={radius.md}
          backgroundColor="$surface"
          overflow="hidden"
        >
          <ScrollView style={{ maxHeight: MAX_LIST_HEIGHT }} nestedScrollEnabled>
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  key={String(option.value)}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  role="button"
                  aria-label={option.label}
                  aria-selected={isSelected}
                >
                  <XStack
                    paddingHorizontal={space[4]}
                    paddingVertical={space[3]}
                    backgroundColor={isSelected ? '$accentTint' : 'transparent'}
                  >
                    <Text
                      variant="small"
                      tone={isSelected ? 'accent' : 'default'}
                      flex={1}
                      textAlign="left"
                    >
                      {option.label}
                    </Text>
                  </XStack>
                </Pressable>
              );
            })}
          </ScrollView>
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
