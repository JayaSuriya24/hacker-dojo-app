import { Pressable, View } from 'react-native';
import { XStack } from 'tamagui';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { HIT_SLOP_MIN, radius, space } from '~/theme/tokens';
import { pressableFocusRing } from '~/theme/focus';

/**
 * The segmented control — the Hardware/Rooms/My bookings and
 * Who's here/Members/Startups switches.
 *
 * Rendered as a `tablist` with `tab` children rather than a row of buttons, so
 * a screen reader announces "tab 2 of 3, selected" and both platforms' rotor
 * navigation treats it as one control.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /**
   * Named for the DOM attribute rather than React Native's `accessibilityLabel`
   * so it matches what callers write. Worth knowing: TypeScript does not
   * excess-property-check hyphenated JSX attributes, so a mismatch here fails
   * silently at runtime instead of at the type level.
   */
  'aria-label'?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  const palette = usePalette();

  return (
    <XStack
      role="tablist"
      aria-label={ariaLabel}
      backgroundColor="$surfaceAlt"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius={radius.md}
      padding={space[1]}
      gap={space[1]}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            role="tab"
            aria-label={option.label}
            aria-selected={selected}
            style={(state) => [{ flex: 1 }, pressableFocusRing(state, palette)]}
          >
            <View
              style={{
                minHeight: HIT_SLOP_MIN - space[1] * 2,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.sm + 2,
                backgroundColor: selected ? palette.accentTintStrong : 'transparent',
                borderWidth: 1,
                borderColor: selected ? palette.accentBorder : 'transparent',
              }}
            >
              <Text
                variant="small"
                color={selected ? palette.accentText : palette.textSubtle}
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </XStack>
  );
}
