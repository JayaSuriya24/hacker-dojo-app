import { useCallback, useState } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Rect } from 'react-native-svg';
import { XStack, YStack } from 'tamagui';
import { Button, Card, Text } from '~/components/ui';
import { usePalette } from '~/providers/ThemeProvider';
import { useHaptics } from '~/store/preferences.store';
import { openKisiApp } from '~/features/access/services/kisiApp';
import { space } from '~/theme/tokens';

/**
 * Door access — an entry point, and nothing more.
 *
 * This card has been three different things. It began as theatre: a hardcoded
 * key id and a local timer that reached "Access granted" without contacting
 * anything. It then became a real authorisation — membership, credential,
 * revocation and rate limit checked server side, with an audit row per attempt.
 *
 * It is now neither, because the whole of physical access moved to Kisi. Kisi
 * holds the member's credential, decides whether they may enter, chooses the
 * door and opens it, and keeps the access history. Duplicating any part of that
 * here would create a second source of truth that drifts from the one actually
 * wired to the lock — an app insisting a member is allowed in while the door
 * disagrees is worse than an app that never claimed to know.
 *
 * So there is no key code, no unlock request, and no result state. The button
 * opens Kisi. Whether the door opens is answered in Kisi, by Kisi.
 */
export function DigitalKey() {
  const palette = usePalette();
  const hapticsEnabled = useHaptics();
  const [failed, setFailed] = useState(false);

  const handleOpen = useCallback(async () => {
    setFailed(false);
    if (hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const opened = await openKisiApp();
    if (!opened) {
      // The only failure this card can have: we could not hand off. It says
      // nothing about the door, because this app no longer knows anything
      // about the door.
      setFailed(true);
      if (hapticsEnabled) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }, [hapticsEnabled]);

  return (
    <Card tone="accent">
      <Text variant="eyebrow">Digital key</Text>

      <XStack alignItems="center" gap={space[5]} marginTop={space[3]}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.accent,
            backgroundColor: palette.accentTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" aria-hidden>
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
        </View>

        <YStack flex={1} gap={space[1]}>
          <Text variant="subtitle">Unlock front door</Text>
          <Text variant="small" tone="subtle">
            Door access runs in the Kisi app. You&apos;ll need it installed — tap below and
            we&apos;ll take you there.
          </Text>
        </YStack>
      </XStack>

      {/* `Button` takes no layout props, so the spacing lives on a wrapper. */}
      <YStack marginTop={space[4]}>
        <Button
          variant="primary"
          fullWidth
          onPress={() => void handleOpen()}
          aria-label="Open the Kisi app to unlock the door"
          accessibilityHint="Leaves Hacker Dojo and opens Kisi, where door access is handled"
        >
          Open Kisi
        </Button>
      </YStack>

      {failed ? (
        <Text variant="small" tone="error" aria-live="polite" marginTop={space[2]}>
          Could not open Kisi. Install the Kisi app from the App Store or Google Play to unlock
          doors.
        </Text>
      ) : null}
    </Card>
  );
}
