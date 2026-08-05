import { Platform, Pressable, Switch, View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { HIT_SLOP_MIN, space } from '~/theme/tokens';

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

export function Toggle({ label, description, value, onChange, disabled }: ToggleProps) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      style={{ minHeight: HIT_SLOP_MIN, opacity: disabled ? 0.45 : 1 }}
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
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Switch
            value={value}
            onValueChange={onChange}
            disabled={disabled}
            trackColor={{ false: palette.borderStrong, true: palette.accent }}
            thumbColor={Platform.OS === 'android' ? palette.surface : undefined}
            ios_backgroundColor={palette.borderStrong}
          />
        </View>
      </XStack>
    </Pressable>
  );
}
