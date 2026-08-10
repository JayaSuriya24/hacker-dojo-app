import { useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Button, Card, Chip, ErrorState, ListSkeleton, Text } from '~/components/ui';
import { useCancelRsvp, useEvent, useRsvp } from '~/features/events/hooks/useEvents';
import { usePalette } from '~/providers/ThemeProvider';
import { formatDateRange } from '~/utils/format';
import { radius, space } from '~/theme/tokens';

/**
 * A deterministic QR-style block for the check-in code.
 *
 * Rendered from a hash of the code rather than being a scannable QR: the front
 * desk verifies the alphanumeric code printed below it, and shipping a real QR
 * encoder for a code a steward reads aloud would be weight for nothing. The
 * pattern is stable per code so it looks like the same badge every time.
 *
 * Both colours come from the theme. The badge previously hardcoded a `#ffffff`
 * ground and painted its cells in `palette.text` — which on the dark ground is
 * `#e9e9ed`, so the pattern was near-white on white and effectively invisible
 * in dark mode. It was also the one place in the app where a hex escaped the
 * theme layer, which is the rule `tokens.ts` exists to enforce.
 *
 * The pair is deliberately inverted rather than themed straight through: a
 * scannable-looking badge needs high contrast between its two colours in both
 * appearances, so it takes the ground/ink pair rather than surface/text.
 */
function CheckinPattern({ code }: { code: string }) {
  const palette = usePalette();

  // On the light ground `textInverse` is the near-white neutral and the ink is
  // the near-black one; on the dark ground both swap, so the badge keeps its
  // contrast rather than inheriting the page's.
  const ink = palette.text;

  const cells = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < code.length; i += 1) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;

    return Array.from({ length: 121 }, (_, index) => {
      const row = Math.floor(index / 11);
      const column = index % 11;
      // Finder squares in three corners, as a real QR has.
      const finder = (row < 3 && column < 3) || (row < 3 && column > 7) || (row > 7 && column < 3);
      return finder || (row * 7 + column * 11 + ((row * column) % 5) + hash) % 3 === 0;
    });
  }, [code]);

  return (
    <View
      accessible
      role="img"
      aria-label={`Check-in code ${code.split('').join(' ')}`}
      style={{
        width: 196,
        height: 196,
        padding: 12,
        borderRadius: radius.md,
        backgroundColor: palette.textInverse,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignSelf: 'center',
      }}
    >
      {cells.map((on, index) => (
        <View
          key={index}
          style={{
            width: `${100 / 11}%`,
            height: `${100 / 11}%`,
            backgroundColor: on ? ink : 'transparent',
          }}
        />
      ))}
    </View>
  );
}

export default function EventSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useEvent(id ?? '');
  const rsvp = useRsvp();
  const cancelRsvp = useCancelRsvp();

  if (query.isPending) {
    return (
      <SheetScreen title="Event">
        <ListSkeleton count={3} height={80} />
      </SheetScreen>
    );
  }

  if (query.isError || !query.data) {
    return (
      <SheetScreen title="Event">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </SheetScreen>
    );
  }

  const event = query.data;
  const going = event.rsvpStatus === 'going';
  const waitlisted = event.rsvpStatus === 'waitlisted';

  return (
    <SheetScreen
      eyebrow={event.category}
      title={event.title}
      footer={
        <Button
          variant={going ? 'secondary' : 'primary'}
          size="lg"
          fullWidth
          loading={rsvp.isPending || cancelRsvp.isPending}
          onPress={() =>
            going || waitlisted ? cancelRsvp.mutate(event.id) : rsvp.mutate(event.id)
          }
        >
          {going
            ? 'Cancel RSVP'
            : waitlisted
              ? 'Leave waitlist'
              : event.atCapacity
                ? 'Join the waitlist'
                : "I'm going"}
        </Button>
      }
    >
      <YStack gap={space[5]}>
        <Card tone="alt">
          <Text variant="small" tone="muted">
            {formatDateRange(event.startsAt, event.endsAt)}
          </Text>
          <Text variant="small" tone="muted">
            {event.roomName} · hosted by {event.hostName}
          </Text>
          <XStack gap={space[2]} marginTop={space[3]} flexWrap="wrap">
            <Chip
              label={`${event.goingCount} of ${event.capacity} going`}
              readOnly
              tone="neutral"
            />
            {event.atCapacity ? <Chip label="At capacity" readOnly tone="error" /> : null}
            {waitlisted ? <Chip label="You are on the waitlist" readOnly tone="warn" /> : null}
          </XStack>
        </Card>

        {event.description ? (
          <Text variant="small" tone="muted">
            {event.description}
          </Text>
        ) : null}

        {/* The check-in badge appears only once there is an RSVP to check in
            against — showing an empty placeholder would invite a member to hold
            up a blank square at the desk. */}
        {going && event.checkinCode ? (
          <YStack gap={space[4]} alignItems="center" marginTop={space[3]}>
            <Text variant="eyebrow">Event check-in</Text>
            <CheckinPattern code={event.checkinCode} />
            <Text variant="mono" tone="accent">
              {event.checkinCode}
            </Text>
            <Text variant="caption" tone="subtle" center>
              Show this at the front desk.
            </Text>
          </YStack>
        ) : null}
      </YStack>
    </SheetScreen>
  );
}
