import { useEffect, useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { Button, Card, StatusPill, Text } from '~/components/ui';
import { formatCountdown } from '~/utils/format';
import { space } from '~/theme/tokens';
import type { LiveSession } from '~/types/domain';

/**
 * The live phone-booth session with its countdown.
 *
 * The remaining time is recomputed from `expires_at` on every tick rather than
 * decremented from a stored number. Decrementing drifts whenever the app is
 * backgrounded — the JS timer is throttled or suspended — and a member would
 * come back to a clock that says nine minutes left when the booth was released
 * four minutes ago.
 */
export function LiveSessionCard({
  session,
  onExtend,
  onEnd,
  extending,
  ending,
}: {
  session: LiveSession;
  onExtend: () => void;
  onEnd: () => void;
  extending: boolean;
  ending: boolean;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    const recompute = () =>
      setRemaining(
        Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000)),
      );

    recompute();
    const timer = setInterval(recompute, 1000);
    return () => clearInterval(timer);
  }, [session.expires_at]);

  const minutes = Math.floor(remaining / 60);
  const expired = remaining === 0;

  return (
    <Card>
      <XStack alignItems="center" gap={space[3]}>
        <StatusPill label="Live session" tone={expired ? 'error' : 'ok'} bordered={false} />
        <Text
          variant="monoLarge"
          marginLeft="auto"
          tone={expired ? 'error' : 'default'}
          // Read as a whole rather than digit by digit as it ticks.
          accessibilityLabel={expired ? 'Session expired' : `${minutes} minutes remaining`}
        >
          {formatCountdown(remaining)}
        </Text>
      </XStack>

      <Text variant="title" marginTop={space[2]}>
        Phone Booth B
      </Text>
      <Text variant="small" tone="subtle">
        {expired
          ? "Time's up — please release the booth"
          : `Ends at ${new Date(session.expires_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
      </Text>

      <XStack gap={space[3]} marginTop={space[4]}>
        <YStack flex={1}>
          <Button fullWidth loading={extending} onPress={onExtend}>
            Extend 15m
          </Button>
        </YStack>
        <YStack flex={1}>
          <Button variant="destructive" fullWidth loading={ending} onPress={onEnd}>
            End now
          </Button>
        </YStack>
      </XStack>
    </Card>
  );
}
