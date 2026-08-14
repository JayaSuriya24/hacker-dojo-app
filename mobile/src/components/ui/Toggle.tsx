import { Pressable, Switch, View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { HIT_SLOP_MIN, space } from '~/theme/tokens';
import { pressableFocusRing } from '~/theme/focus';

/**
 * A labelled switch row.
 *
 * Uses the platform `Switch` rather than a custom track-and-knob: it inherits
 * the native gesture (drag as well as tap), the platform's own animation, and
 * the assistive-tech behaviour members already know. A hand-rolled toggle that
 * only responds to taps is a small but real regression on both platforms.
 *
 * The whole row is the tap target, which is what the Material and HIG list
 * patterns both expect.
 */

export interface ToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/** `activeThumbColor` is react-native-web's own prop; React Native's types omit it. */
interface ThumbProps {
  thumbColor: string;
  activeThumbColor?: string;
}

/**
 * Paint the knob white in both states, on every platform.
 *
 * The knob used to be left to the platform everywhere except Android, and on
 * web that meant react-native-web's own defaults — `#009688` when on, which is
 * Material teal and read as a green knob riding a red Dojo track. Nothing in
 * the Dojo palette is green, so it could only have come from a default.
 *
 * Two props are needed rather than one because react-native-web picks the knob
 * colour by state: `activeThumbColor` when on, `thumbColor` when off. Setting
 * only `thumbColor` — the obvious fix — recolours the off state and leaves the
 * teal exactly where it was. React Native ignores the extra prop, and its own
 * `thumbColor` already covers both states on iOS and Android.
 *
 * `onAccent` rather than `surface`: this knob sits on the accent track, and it
 * is '#ffffff' in both themes, where `surface` is '#232532' in dark — which
 * would have made the knob disappear into the track at night.
 */
function thumbProps(color: string): ThumbProps {
  return { thumbColor: color, activeThumbColor: color };
}

export function Toggle({ label, description, value, onChange, disabled }: ToggleProps) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      role="switch"
      aria-label={label}
      accessibilityHint={description}
      aria-checked={value}
      aria-disabled={Boolean(disabled)}
      style={(state) => [
        { minHeight: HIT_SLOP_MIN, opacity: disabled ? 0.45 : 1 },
        pressableFocusRing(state, palette),
      ]}
    >
      <XStack alignItems="center" gap={space[4]} paddingVertical={space[3]}>
        <YStack flex={1} gap={space[1]}>
          <Text variant="body">{label}</Text>
          {description ? (
            <Text variant="caption" tone="subtle">
              {description}
            </Text>
          ) : null}
        </YStack>

        {/* The Switch itself is hidden from assistive tech — the Pressable
            above already exposes the switch role and its state, and leaving
            both visible makes VoiceOver announce the control twice. */}
        <View aria-hidden>
          <Switch
            value={value}
            onValueChange={onChange}
            disabled={disabled}
            trackColor={{ false: palette.borderStrong, true: palette.accent }}
            {...thumbProps(palette.onAccent)}
            ios_backgroundColor={palette.borderStrong}
          />
        </View>
      </XStack>
    </Pressable>
  );
}
