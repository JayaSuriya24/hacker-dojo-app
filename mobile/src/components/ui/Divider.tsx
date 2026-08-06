import { LinearGradient } from 'tamagui/linear-gradient';
import { View } from 'react-native';
import { usePalette } from '~/providers/ThemeProvider';
import { space } from '~/theme/tokens';

/**
 * A horizontal rule.
 *
 * Nocturne's `.hr` fades to transparent at both ends over 48px — "Rules fade to
 * transparent at their ends rather than stopping cleanly" — and that end-fade is
 * one of the two or three things that make the system recognisable. The app was
 * drawing flat 1px borders everywhere instead.
 *
 * The system also says it prefers whitespace and to avoid the rule where a gap
 * would do, which is why this is a component call rather than a border prop:
 * reaching for it should be a decision.
 */

/** One deck baseline unit — the fade length the design specifies. */
const FADE_LENGTH = 48;

export interface DividerProps {
  /** Vertical margin around the rule. Defaults to the design's `--space-4`. */
  spacing?: number;
  /**
   * `full` fades at both ends; `inset` is a plain rule for use inside a bordered
   * container, where a fade would read as a rendering artefact rather than as
   * the system's signature.
   */
  variant?: 'full' | 'inset';
}

export function Divider({ spacing = space[4], variant = 'full' }: DividerProps) {
  const palette = usePalette();

  if (variant === 'inset') {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: 1, backgroundColor: palette.border, marginVertical: spacing }}
      />
    );
  }

  return (
    <LinearGradient
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      height={1}
      marginVertical={spacing}
      // Four stops rather than a symmetric three: the solid section has to hold
      // its colour across the middle, so the fade is pinned to a fixed 48px at
      // each end instead of scaling with the container's width.
      colors={['transparent', palette.border, palette.border, 'transparent']}
      locations={[0, FADE_LENGTH / 400, 1 - FADE_LENGTH / 400, 1]}
      start={[0, 0]}
      end={[1, 0]}
    />
  );
}
