import { forwardRef, useCallback } from 'react';
import { ActivityIndicator, Pressable, type PressableProps, type View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { XStack } from 'tamagui';
import { Text } from './Text';
import { usePalette } from '~/providers/ThemeProvider';
import { useHaptics } from '~/store/preferences.store';
import { HIT_SLOP_MIN, radius, space } from '~/theme/tokens';

/**
 * The action primitive.
 *
 * Nocturne's rule — "the primary is an accent outline, never a fill" — is why
 * `primary` renders as a 1px accent border on a tinted ground rather than a
 * solid block. `solid` exists for the two places the design does flood: the
 * auth submit and the "Enter the Dojo" confirmation.
 *
 * Accessibility is built in rather than left to call sites: a minimum 48pt
 * target (satisfies both HIG's 44 and Material's 48), `accessibilityRole` and
 * a busy/disabled state that screen readers announce.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'solid' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  children: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Rendered before the label — an icon, a status dot. */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  /** Haptic weight on press. `none` for anything fired repeatedly. */
  haptic?: 'light' | 'medium' | 'none';
}

const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: HIT_SLOP_MIN, paddingHorizontal: space[4], fontSize: 12 },
  md: { height: HIT_SLOP_MIN, paddingHorizontal: space[6], fontSize: 13 },
  lg: { height: 52, paddingHorizontal: space[7], fontSize: 15 },
};

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    fullWidth = false,
    haptic = 'light',
    disabled,
    onPress,
    accessibilityLabel,
    ...rest
  },
  ref,
) {
  const palette = usePalette();
  const hapticsEnabled = useHaptics();
  const metrics = SIZES[size];
  const isDisabled = Boolean(disabled) || loading;

  const styles = {
    primary: {
      background: 'transparent',
      border: palette.accent,
      label: palette.accentText,
      pressed: palette.accentTint,
    },
    secondary: {
      background: 'transparent',
      border: palette.borderStrong,
      label: palette.text,
      pressed: palette.surfaceAlt,
    },
    ghost: {
      background: 'transparent',
      border: 'transparent',
      label: palette.textMuted,
      pressed: palette.surfaceAlt,
    },
    solid: {
      background: palette.accent,
      border: palette.accent,
      label: palette.onAccent,
      pressed: palette.accentText,
    },
    destructive: {
      background: 'transparent',
      border: palette.error,
      label: palette.error,
      pressed: palette.errorTint,
    },
  }[variant];

  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    (event) => {
      if (hapticsEnabled && haptic !== 'none') {
        void Haptics.impactAsync(
          haptic === 'medium'
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light,
        );
      }
      onPress?.(event);
    },
    [hapticsEnabled, haptic, onPress],
  );

  return (
    <Pressable
      ref={ref}
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      // Announces "dimmed" / "disabled" and the busy state to VoiceOver and
      // TalkBack rather than leaving a visually-greyed control unexplained.
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        {
          minHeight: metrics.height,
          paddingHorizontal: metrics.paddingHorizontal,
          borderRadius: radius.md,
          borderWidth: variant === 'ghost' ? 0 : 1,
          borderColor: styles.border,
          backgroundColor: pressed ? styles.pressed : styles.background,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space[2],
          opacity: isDisabled ? 0.45 : 1,
          ...(fullWidth ? { alignSelf: 'stretch' } : {}),
        },
      ]}
      {...rest}
    >
      <XStack alignItems="center" justifyContent="center" gap={space[2]}>
        {loading ? <ActivityIndicator size="small" color={styles.label} /> : icon}
        <Text
          fontSize={metrics.fontSize}
          fontWeight="500"
          color={styles.label}
          // Cap the growth so a very large accessibility text size does not
          // push a two-word label onto three lines inside a fixed-height row.
          maxFontSizeMultiplier={1.4}
        >
          {children}
        </Text>
      </XStack>
    </Pressable>
  );
});
