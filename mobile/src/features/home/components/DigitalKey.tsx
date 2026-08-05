import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Rect } from 'react-native-svg';
import { XStack, YStack } from 'tamagui';
import { Card, Text } from '~/components/ui';
import { usePalette } from '~/providers/ThemeProvider';
import { useHaptics } from '~/store/preferences.store';
import { useReducedMotion } from '~/hooks/useReducedMotion';
import { radius, space } from '~/theme/tokens';

/**
 * The digital keycard.
 *
 * The unlock is a three-state machine — idle, reading, granted — and each state
 * changes the icon, the title AND the subtitle. A door control that signals
 * success only with a colour change is the kind of thing someone stands in the
 * rain squinting at.
 *
 * Success fires a notification haptic rather than an impact one: on iOS that is
 * a distinct double-tap pattern the OS reserves for outcomes, so a member gets
 * confirmation without looking at the screen at all.
 */

type UnlockState = 'idle' | 'reading' | 'granted';

const GRANTED_HOLD_MS = 3000;

export function DigitalKey({ keyId, onUnlock }: { keyId: string; onUnlock?: () => Promise<void> }) {
  const palette = usePalette();
  const hapticsEnabled = useHaptics();
  const reducedMotion = useReducedMotion();

  const [state, setState] = useState<UnlockState>('idle');
  const ring = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    // Clear on unmount so a state update never lands on a gone component.
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (state === 'idle' || reducedMotion) {
      ring.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 1100,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [state, ring, reducedMotion]);

  const handleUnlock = useCallback(async () => {
    if (state !== 'idle') return;

    setState('reading');
    if (hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await onUnlock?.();
      setState('granted');
      if (hapticsEnabled) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      timers.current.push(setTimeout(() => setState('idle'), GRANTED_HOLD_MS));
    } catch {
      setState('idle');
      if (hapticsEnabled) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }, [state, onUnlock, hapticsEnabled]);

  const copy = {
    idle: { title: 'Unlock front door', sub: 'Tap, then hold your phone to the reader' },
    reading: { title: 'Reading key…', sub: 'Hold near the reader' },
    granted: { title: 'Access granted', sub: 'Front door open for 8 seconds' },
  }[state];

  return (
    <Card tone="accent">
      <Text variant="eyebrow">Digital key</Text>

      <XStack alignItems="center" gap={space[5]} marginTop={space[3]}>
        <View style={{ width: 74, height: 74, alignItems: 'center', justifyContent: 'center' }}>
          {state !== 'idle' ? (
            <Animated.View
              accessibilityElementsHidden
              style={{
                position: 'absolute',
                width: 74,
                height: 74,
                borderRadius: radius.pill,
                borderWidth: 2,
                borderColor: palette.accent,
                opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
                transform: [
                  { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] }) },
                ],
              }}
            />
          ) : null}

          <Pressable
            onPress={() => void handleUnlock()}
            disabled={state !== 'idle'}
            accessibilityRole="button"
            accessibilityLabel="Unlock the front door"
            accessibilityHint="Hold your phone near the reader after tapping"
            accessibilityState={{ busy: state === 'reading', disabled: state !== 'idle' }}
            style={({ pressed }) => ({
              width: 64,
              height: 64,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: palette.accent,
              backgroundColor:
                state === 'granted'
                  ? palette.accentTintStrong
                  : pressed
                    ? palette.accentTintStrong
                    : palette.accentTint,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            {state === 'reading' ? (
              <ActivityIndicator color={palette.accentText} />
            ) : state === 'granted' ? (
              <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M4 12.5l5 5L20 6.5"
                  stroke={palette.accentText}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            ) : (
              <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                <Rect
                  x={4}
                  y={10.5}
                  width={16}
                  height={10.5}
                  rx={2.5}
                  stroke={palette.accentText}
                  strokeWidth={1.8}
                />
                <Path
                  d="M8 10.5V7a4 4 0 0 1 8 0v3.5"
                  stroke={palette.accentText}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              </Svg>
            )}
          </Pressable>
        </View>

        {/* `polite` so the state change is read after the current utterance
            rather than cutting across the button's own label. */}
        <YStack flex={1} gap={space[1]} accessibilityLiveRegion="polite">
          <Text variant="title">{copy.title}</Text>
          <Text variant="small" tone="subtle">
            {copy.sub}
          </Text>
          <Text variant="mono" tone="subtle" marginTop={space[2]}>
            KEY · {keyId}
          </Text>
        </YStack>
      </XStack>
    </Card>
  );
}
