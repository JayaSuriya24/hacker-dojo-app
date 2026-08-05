import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { HIT_SLOP_MIN, radius, space } from '~/theme/tokens';

/**
 * The pill used for filters (event categories, directory skills) and for
 * static labels (category tags, "Hiring", "At capacity").
 *
 * Selection is exposed to assistive tech through `accessibilityState.selected`
 * rather than colour alone — a filter row that only signals state with a tint
 * is unusable with a screen reader and ambiguous for colour-blind users, which
 * is also why the selected state changes the border weight and text colour, not
 * just the fill.
 */

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'accent' | 'neutral' | 'ok' | 'warn' | 'error';
  /** Non-interactive label. Renders without a pressable wrapper. */
  readOnly?: boolean;
}

export function Chip({ label, selected = false, onPress, tone = 'accent', readOnly }: ChipProps) {
  const palette = usePalette();

  const toneColor = {
    accent: palette.accentText,
    neutral: palette.textMuted,
    ok: palette.ok,
    warn: palette.warn,
    error: palette.error,
  }[tone];

  const containerStyle = {
    minHeight: readOnly ? 26 : HIT_SLOP_MIN,
    paddingHorizontal: space[4],
    paddingVertical: readOnly ? space[1] : 0,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: selected ? palette.accent : palette.border,
    backgroundColor: selected ? palette.accentTintStrong : 'transparent',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: 'flex-start' as const,
  };

  const content = (
    <Text
      variant={readOnly ? 'caption' : 'small'}
      color={selected ? palette.accentText : toneColor}
      maxFontSizeMultiplier={1.3}
      numberOfLines={1}
    >
      {label}
    </Text>
  );

  if (readOnly || !onPress) {
    return (
      <View style={containerStyle} accessible accessibilityRole="text">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [containerStyle, pressed && { backgroundColor: palette.accentTint }]}
    >
      {content}
    </Pressable>
  );
}
