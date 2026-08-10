import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Button, Card, Chip, Text } from '~/components/ui';
import { usePalette } from '~/providers/ThemeProvider';
import { formatDayMonth, formatTime } from '~/utils/format';
import { radius, space } from '~/theme/tokens';
import type { DojoEvent } from '~/types/domain';

/**
 * One event in the list.
 *
 * `memo` matters here: RSVPing patches one event in the cache, and without it
 * every card in a twelve-item list re-renders on each tap. The comparison is
 * explicit rather than shallow because the object identity changes on every
 * query refetch even when nothing a card displays has moved.
 */

export interface EventCardProps {
  event: DojoEvent;
  onPress: () => void;
  onRsvp: () => void;
  rsvpPending?: boolean;
}

function EventCardComponent({ event, onPress, onRsvp, rsvpPending }: EventCardProps) {
  const palette = usePalette();
  const { month, day } = formatDayMonth(event.startsAt);

  const going = event.rsvpStatus === 'going';
  const waitlisted = event.rsvpStatus === 'waitlisted';

  const barColor =
    event.fillPercent >= 100
      ? palette.error
      : event.fillPercent > 80
        ? palette.warn
        : palette.accent;

  return (
    <Card>
      <Pressable
        onPress={onPress}
        role="button"
        // One label carrying everything a sighted member reads at a glance,
        // rather than five separate nodes to swipe through.
        aria-label={`${event.title}. ${month} ${day} at ${formatTime(event.startsAt)}, ${event.roomName}. Hosted by ${event.hostName}. ${event.goingCount} of ${event.capacity} going.`}
        accessibilityHint="Opens the event details"
      >
        <XStack gap={space[4]} alignItems="flex-start">
          <YStack
            width={44}
            alignItems="center"
            paddingVertical={space[2]}
            backgroundColor="$surfaceAlt"
            borderWidth={1}
            borderColor="$borderColor"
            borderRadius={radius.md}
            aria-hidden
          >
            <Text variant="caption" tone="subtle">
              {month}
            </Text>
            <Text variant="mono" fontSize={17} fontWeight="600">
              {day}
            </Text>
          </YStack>

          <YStack flex={1} gap={space[2]}>
            <XStack gap={space[2]} alignItems="center" flexWrap="wrap">
              <Chip label={event.category} readOnly />
              {event.atCapacity && !going ? (
                <Chip label="At capacity" tone="error" readOnly />
              ) : null}
              {waitlisted ? <Chip label="Waitlisted" tone="warn" readOnly /> : null}
            </XStack>

            <Text variant="title" numberOfLines={2}>
              {event.title}
            </Text>
            <Text variant="small" tone="subtle">
              {formatTime(event.startsAt)} · {event.roomName} · {event.hostName}
            </Text>
          </YStack>
        </XStack>
      </Pressable>

      {/* Capacity. The numbers above the bar carry the same information, so the
          bar is reinforcement rather than the only signal. */}
      <YStack gap={space[2]} marginTop={space[3]} aria-hidden>
        <XStack>
          <Text variant="caption" tone="subtle">
            {event.goingCount} going
          </Text>
          <Text variant="caption" tone="subtle" marginLeft="auto">
            {event.capacity} cap
          </Text>
        </XStack>
        <View
          style={{
            height: 4,
            borderRadius: 3,
            backgroundColor: palette.surfaceSunken,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              height: '100%',
              width: `${event.fillPercent}%`,
              backgroundColor: barColor,
              borderRadius: 3,
            }}
          />
        </View>
      </YStack>

      <XStack marginTop={space[4]}>
        <Button
          variant={going ? 'primary' : 'secondary'}
          loading={rsvpPending}
          onPress={onRsvp}
          aria-label={going ? `Cancel your RSVP for ${event.title}` : `RSVP to ${event.title}`}
        >
          {going
            ? 'Going ✓'
            : waitlisted
              ? 'On waitlist'
              : event.atCapacity
                ? 'Join waitlist'
                : 'RSVP'}
        </Button>
      </XStack>
    </Card>
  );
}

export const EventCard = memo(EventCardComponent, (previous, next) => {
  const a = previous.event;
  const b = next.event;

  return (
    a.id === b.id &&
    a.rsvpStatus === b.rsvpStatus &&
    a.goingCount === b.goingCount &&
    a.atCapacity === b.atCapacity &&
    a.title === b.title &&
    a.startsAt === b.startsAt &&
    previous.rsvpPending === next.rsvpPending
  );
});
