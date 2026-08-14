import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, View } from 'react-native';
import { YStack } from 'tamagui';
import { Text } from './Text';
import { Button } from './Button';
import { usePalette } from '~/providers/ThemeProvider';
import { isApiError, userMessage } from '~/services/api/errors';
import { radius, space } from '~/theme/tokens';
import { useReducedMotion } from '~/hooks/useReducedMotion';
import { ambientEasing, timing } from '~/theme/motion';

/**
 * Loading, empty and error states.
 *
 * Every list and every screen in this app renders one of these rather than
 * inventing its own — a screen that shows a bare spinner in one place and a
 * centred sentence in another reads as unfinished, and the error case is where
 * that inconsistency is most visible to a member.
 */

/** A shimmer placeholder sized to the content it stands in for. */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = radius.sm,
}: {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
}) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // A looping shimmer is exactly the kind of motion that triggers vestibular
    // discomfort; with Reduce Motion on it holds at a static tint instead.
    if (reducedMotion) {
      pulse.setValue(0.7);
      return;
    }

    const pulseStep = timing('ambient', { easing: ambientEasing });

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, ...pulseStep }),
        Animated.timing(pulse, { toValue: 0.5, ...pulseStep }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [pulse, reducedMotion]);

  return (
    <Animated.View
      aria-hidden
      style={{ width, height, borderRadius, backgroundColor: palette.skeleton, opacity: pulse }}
    />
  );
}

/** Card-shaped skeletons, matching the real list item's rhythm. */
export function ListSkeleton({ count = 3, height = 96 }: { count?: number; height?: number }) {
  return (
    <YStack gap={space[4]} aria-label="Loading" role="progressbar">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height={height} borderRadius={radius.lg} />
      ))}
    </YStack>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  const palette = usePalette();

  return (
    <YStack
      paddingVertical={space[14]}
      alignItems="center"
      gap={space[4]}
      role="progressbar"
      aria-label={label}
    >
      <ActivityIndicator color={palette.accent} />
      <Text variant="caption" tone="subtle">
        {label}
      </Text>
    </YStack>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <YStack
      paddingVertical={space[12]}
      paddingHorizontal={space[6]}
      alignItems="center"
      gap={space[3]}
    >
      {icon ? <View aria-hidden>{icon}</View> : null}
      <Text variant="subtitle" center>
        {title}
      </Text>
      {description ? (
        <Text variant="small" tone="subtle" center>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <YStack marginTop={space[3]}>
          <Button onPress={onAction}>{actionLabel}</Button>
        </YStack>
      ) : null}
    </YStack>
  );
}

/**
 * The error state.
 *
 * The retry button is shown only when retrying could plausibly help. Offering
 * "Try again" on a 403 trains members to tap a button that will never work.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const palette = usePalette();
  const canRetry = Boolean(onRetry) && (!isApiError(error) || error.retryable);

  return (
    <YStack
      paddingVertical={space[12]}
      paddingHorizontal={space[6]}
      alignItems="center"
      gap={space[3]}
      aria-live="polite"
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: palette.error,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-hidden
      >
        <Text variant="title" tone="error">
          !
        </Text>
      </View>

      <Text variant="subtitle" center>
        {isApiError(error) && error.isMembershipGate ? 'Members only' : "That didn't work"}
      </Text>
      <Text variant="small" tone="subtle" center>
        {userMessage(error)}
      </Text>

      {isApiError(error) && error.requestId ? (
        <Text variant="caption" tone="subtle" center>
          Reference {error.requestId.slice(0, 8)}
        </Text>
      ) : null}

      {canRetry ? (
        <YStack marginTop={space[3]}>
          <Button onPress={onRetry}>Try again</Button>
        </YStack>
      ) : null}
    </YStack>
  );
}
