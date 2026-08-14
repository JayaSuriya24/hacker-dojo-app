import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Chip, Text } from '~/components/ui';
import { space } from '~/theme/tokens';
import type { EventSeries } from '~/types/domain';

/**
 * The other dates of a recurring event.
 *
 * Each chip is a different event row with its own attendee list, so selecting
 * one navigates rather than filtering in place: RSVPing to the 18th must not
 * quietly sign you up for the 11th. `replace` rather than `push` so tapping
 * through four dates does not build four entries to back out of.
 *
 * The rule itself arrives from the server as a finished sentence. Rendering
 * "Every week on Tuesday" from parts on the client would put the same grammar
 * in three codebases and let them disagree.
 */

/** Rendered on the chips: "Aug 18 · 6:30 PM". */
function label(startsAt: string): string {
  const date = new Date(startsAt);
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

export function SeriesSchedule({
  series,
  currentEventId,
}: {
  series: EventSeries;
  currentEventId: string;
}) {
  // One remaining date is not a series worth showing a picker for — the date is
  // already at the top of the sheet.
  if (series.upcoming.length < 2) {
    return (
      <Text variant="caption" tone="subtle">
        {series.summary}
      </Text>
    );
  }

  return (
    <YStack gap={space[2]}>
      <Text variant="eyebrow">Repeats</Text>
      <Text variant="small" tone="muted">
        {series.summary}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -space[5] }}
        contentContainerStyle={{ paddingHorizontal: space[5], gap: space[2] }}
      >
        <XStack gap={space[2]}>
          {series.upcoming.map((occurrence) => (
            <Chip
              key={occurrence.eventId}
              label={label(occurrence.startsAt)}
              selected={occurrence.eventId === currentEventId}
              onPress={
                occurrence.eventId === currentEventId
                  ? undefined
                  : () => router.replace(`/(app)/event/${occurrence.eventId}`)
              }
            />
          ))}
        </XStack>
      </ScrollView>
    </YStack>
  );
}
