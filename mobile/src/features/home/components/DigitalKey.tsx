import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Rect } from 'react-native-svg';
import { XStack, YStack } from 'tamagui';
import { Card, Text } from '~/components/ui';
import { usePalette } from '~/providers/ThemeProvider';
import { useHaptics } from '~/store/preferences.store';
import { useReducedMotion } from '~/hooks/useReducedMotion';
import { useDigitalKey, useUnlockDoor } from '~/features/access/hooks/useAccess';
import { userMessage } from '~/services/api/errors';
import { ambientEasing, timing } from '~/theme/motion';
import { radius, space } from '~/theme/tokens';

/**
 * The digital keycard.
 *
 * This used to be theatre. The card took a hardcoded `keyId`, ran a local
 * three-state machine, and reached "Access granted" after a timer without
 * contacting anything — so a lapsed member got the same green tick as a paid-up
 * one, and a member who could not get in left no trace for anyone to look at.
 *
 * Every state below is now the server's answer: the key comes from
 * `door_credentials`, the unlock is a request that checks membership and
 * credential status and writes an audit row either way, and a refusal renders
 * the reason rather than silently resetting.
 *
 * The three visual states each change the icon, the title AND the subtitle. A
 * door control that signals success only with a colour change is the kind of
 * thing someone stands in the rain squinting at. Success fires a notification
 * haptic rather than an impact one: on iOS that is a distinct double-tap
 * pattern the OS reserves for outcomes, so confirmation arrives without looking.
 */

type UnlockState = 'idle' | 'reading' | 'granted' | 'refused';

/** How long the confirmation holds before the card returns to rest. */
const GRANTED_HOLD_MS = 3000;
/** A refusal holds longer — there is a sentence to read. */
const REFUSED_HOLD_MS = 5000;

export function DigitalKey() {
  const palette = usePalette();
  const hapticsEnabled = useHaptics();
  const reducedMotion = useReducedMotion();

  const key = useDigitalKey();
  const unlock = useUnlockDoor();

  const [state, setState] = useState<UnlockState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const ring = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    // Clear on unmount so a state update never lands on a gone component.
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (state !== 'reading' || reducedMotion) {
      ring.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(ring, { toValue: 1, ...timing('ambient', { easing: ambientEasing }) }),
    );
    animation.start();
    return () => animation.stop();
  }, [state, ring, reducedMotion]);

  const handleUnlock = useCallback(async () => {
    if (state === 'reading') return;

    setState('reading');
    setMessage(null);
    if (hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await unlock.mutateAsync();
      setState('granted');
      setMessage(result.message);
      if (hapticsEnabled) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      timers.current.push(setTimeout(() => setState('idle'), GRANTED_HOLD_MS));
    } catch (error) {
      // The server's sentence, verbatim: "Your membership is not active, so the
      // door will not open" is actionable in a way that "Access denied" is not.
      setState('refused');
      setMessage(userMessage(error));
      if (hapticsEnabled) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      timers.current.push(setTimeout(() => setState('idle'), REFUSED_HOLD_MS));
    }
  }, [state, unlock, hapticsEnabled]);

  const copy = {
    idle: {
      title: 'Unlock front door',
      sub: 'Tap, then hold your phone to the reader',
    },
    reading: { title: 'Checking your key…', sub: 'Hold near the reader' },
    granted: { title: 'Access granted', sub: message ?? 'The door is open' },
    refused: { title: 'Not opened', sub: message ?? 'Ask a steward at the front desk' },
  }[state];

  const tone = state === 'refused' ? palette.error : palette.accent;
  const labelTone = state === 'refused' ? palette.error : palette.accentText;

  return (
    <Card tone="accent">
      <Text variant="eyebrow">Digital key</Text>

      <XStack alignItems="center" gap={space[5]} marginTop={space[3]}>
        <View style={{ width: 74, height: 74, alignItems: 'center', justifyContent: 'center' }}>
          {state === 'reading' ? (
            <Animated.View
              aria-hidden
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
            disabled={state === 'reading' || !key.data?.active}
            role="button"
            aria-label="Unlock the front door"
            accessibilityHint="Hold your phone near the reader after tapping"
            aria-busy={state === 'reading'}
            aria-disabled={state === 'reading' || !key.data?.active}
            style={({ pressed }) => ({
              width: 64,
              height: 64,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: tone,
              backgroundColor:
                state === 'granted' || pressed ? palette.accentTintStrong : palette.accentTint,
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
            ) : state === 'refused' ? (
              <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M6 6l12 12M18 6L6 18"
                  stroke={palette.error}
                  strokeWidth={2.2}
                  strokeLinecap="round"
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
        <YStack flex={1} gap={space[1]} aria-live="polite">
          <Text variant="title" color={state === 'refused' ? labelTone : palette.text}>
            {copy.title}
          </Text>
          <Text variant="small" tone={state === 'refused' ? 'error' : 'subtle'}>
            {copy.sub}
          </Text>
          <Text variant="mono" tone="subtle" marginTop={space[2]}>
            {key.isPending ? 'KEY · …' : key.data ? `KEY · ${key.data.keyId}` : 'No key issued'}
          </Text>
        </YStack>
      </XStack>
    </Card>
  );
}
