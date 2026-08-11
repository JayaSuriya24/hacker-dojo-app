import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { YStack } from 'tamagui';
import { Button, Card, Text } from '~/components/ui';
import { useReducedMotion } from '~/hooks/useReducedMotion';
import { timing } from '~/theme/motion';
import { space } from '~/theme/tokens';

/**
 * The "I'm here" card, shown when a member has no open session.
 *
 * Checking in is the only thing that puts a row in `sessions`, and `sessions`
 * is the only thing the occupancy dial counts. Unlocking the door writes an
 * audit row and nothing else, so before this existed the dial could not leave
 * zero through any normal use of the app.
 *
 * Deliberately one button rather than an in/out toggle. The two states are not
 * symmetric: checking in is a single tap, while being checked in needs the
 * remaining time and the extend affordance that `LiveSessionCard` already
 * carries. A toggle would have to hide those or duplicate them.
 */
export function CheckInCard({ busy, onCheckIn }: { busy: boolean; onCheckIn: () => void }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  // Rises in on mount, and on the swap back from `LiveSessionCard` when a
  // session ends — the two cards occupy the same slot, and a hard cut between
  // them reads as a glitch rather than a state change.
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      ...timing('base', { reducedMotion }),
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
        ],
      }}
    >
      <Card gap={space[3]}>
        <YStack gap={space[1]}>
          <Text variant="eyebrow">On the floor</Text>
          <Text variant="title">Check in when you arrive</Text>
          <Text variant="small" tone="subtle">
            Adds you to the live count so members can see how busy the space is.
          </Text>
        </YStack>

        <Button
          variant="primary"
          fullWidth
          loading={busy}
          aria-label="Check in to the floor"
          accessibilityHint="Adds you to the live occupancy count until you check out."
          onPress={onCheckIn}
        >
          {busy ? 'Checking in…' : 'Check in'}
        </Button>
      </Card>
    </Animated.View>
  );
}
