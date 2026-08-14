import { ActivityIndicator, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { YStack } from 'tamagui';
import { usePalette } from '~/providers/ThemeProvider';
import { radius } from '~/theme/tokens';

/**
 * Refresh the feed.
 *
 * The list already carries a `RefreshControl`, which covers iOS and Android —
 * but pull-to-refresh needs a pull, and there is no such gesture with a mouse.
 * On web the feed could only be updated by reloading the page, so this is the
 * affordance that was missing rather than a duplicate of one that exists.
 *
 * It renders on every platform anyway: a visible control is discoverable in a
 * way a hidden gesture is not, and a member who has just been told an event was
 * added should not have to know to drag the screen.
 */

/** Matches the icon buttons elsewhere: 36pt visual, 48pt effective target. */
const SIZE = 36;

export function RefreshButton({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={onPress}
      // Disabled while in flight so an impatient double tap does not queue a
      // second request behind the first.
      disabled={busy}
      role="button"
      aria-label="Refresh events"
      aria-busy={busy}
      accessibilityHint="Checks for new and updated events"
      hitSlop={12}
    >
      <YStack
        width={SIZE}
        height={SIZE}
        borderRadius={radius.pill}
        alignItems="center"
        justifyContent="center"
        backgroundColor="$surfaceAlt"
        opacity={busy ? 0.6 : 1}
      >
        {busy ? (
          <ActivityIndicator size="small" color={palette.accentText} />
        ) : (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            {/* A circular arrow: an arc that stops short of closing, plus the
                head that shows which way it turns. */}
            <Path
              d="M20 12a8 8 0 1 1-2.34-5.66"
              stroke={palette.accentText}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <Path
              d="M20 4v5h-5"
              stroke={palette.accentText}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )}
      </YStack>
    </Pressable>
  );
}
