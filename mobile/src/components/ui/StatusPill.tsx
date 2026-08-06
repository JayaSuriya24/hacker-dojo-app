import { View } from 'react-native';
import { XStack } from 'tamagui';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { radius, space } from '~/theme/tokens';

/**
 * A dot-plus-label status marker — "Open now", "Available", "Maintenance".
 *
 * The label always states the status in words. The dot is reinforcement, not
 * the message, which is what keeps this readable without colour perception.
 */

export type StatusTone = 'ok' | 'warn' | 'error' | 'neutral' | 'accent';

export function StatusPill({
  label,
  tone = 'ok',
  bordered = true,
}: {
  label: string;
  tone?: StatusTone;
  bordered?: boolean;
}) {
  const palette = usePalette();

  const color = {
    ok: palette.ok,
    warn: palette.warn,
    error: palette.error,
    neutral: palette.textSubtle,
    accent: palette.accentText,
  }[tone];

  return (
    <XStack
      alignItems="center"
      gap={space[2]}
      paddingHorizontal={space[3]}
      paddingVertical={space[1]}
      borderRadius={radius.pill}
      borderWidth={bordered ? 1 : 0}
      borderColor={bordered ? palette.border : 'transparent'}
      alignSelf="flex-start"
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <View
        style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: color }}
        accessibilityElementsHidden
      />
      <Text variant="caption" color={color} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </XStack>
  );
}
