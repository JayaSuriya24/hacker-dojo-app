import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { HIT_SLOP_MIN, radius, space } from '~/theme/tokens';
import { pressableFocusRing } from '~/theme/focus';

/**
 * The pill used for filters (event categories, directory skills) and for
 * static labels (category tags, "Hiring", "At capacity").
 *
 * Selection is exposed to assistive tech through `aria-selected`
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
    // Nocturne's `.tag` is `calc(var(--radius-md) * 0.75)` — a soft rectangle,
    // not a pill. The pill radius here was reading as a different component
    // family from the one in the design file.
    borderRadius: radius.tag,
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
      <View style={containerStyle} accessible>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      role="button"
      aria-label={label}
      aria-selected={selected}
      style={(state) => [
        containerStyle,
        state.pressed && { backgroundColor: palette.accentTint },
        pressableFocusRing(state, palette),
      ]}
    >
      {content}
    </Pressable>
  );
}
