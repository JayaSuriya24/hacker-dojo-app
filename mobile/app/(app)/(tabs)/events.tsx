import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack } from 'tamagui';
import { Button, Chip, EmptyState, ErrorState, ListSkeleton, ScreenHeader } from '~/components/ui';
import { RefreshButton } from '~/features/events/components/RefreshButton';
import { EventCard } from '~/features/events/components/EventCard';
import { useCancelRsvp, useEvents, useRsvp } from '~/features/events/hooks/useEvents';
import { usePreferencesStore } from '~/store/preferences.store';
import { usePalette } from '~/providers/ThemeProvider';
import { space } from '~/theme/tokens';
import { EVENT_CATEGORIES, type DojoEvent, type EventCategory } from '~/types/domain';

// 'All' first, then every category the database accepts.
const CATEGORIES: Array<EventCategory | 'All'> = ['All', ...EVENT_CATEGORIES];

/**
 * Events.
 *
 * A `FlatList`, not a ScrollView of cards — the month's feed is unbounded and
 * virtualisation is what keeps it at 60fps as it grows. The filter row and
 * header ride along as `ListHeaderComponent` so they scroll with the content
 * rather than pinning a shrinking viewport.
 */
export default function EventsScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  const category = usePreferencesStore((state) => state.eventCategory);
  const setCategory = usePreferencesStore((state) => state.setEventCategory);

  const query = useEvents(category === 'All' ? {} : { category });
  const rsvp = useRsvp();
  const cancelRsvp = useCancelRsvp();

  // Which card's button shows a spinner — tracked per event so RSVPing on one
  // does not spin every button in the list.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleRsvp = useCallback(
    (event: DojoEvent) => {
      setPendingId(event.id);
      const done = () => setPendingId(null);

      if (event.rsvpStatus === 'going' || event.rsvpStatus === 'waitlisted') {
        cancelRsvp.mutate(event.id, { onSettled: done });
      } else {
        rsvp.mutate(event.id, { onSettled: done });
      }
    },
    [rsvp, cancelRsvp],
  );

  const header = useMemo(
    () => (
      <YStack>
        <ScreenHeader
          eyebrow="This month"
          title="Events"
          trailing={
            <XStack alignItems="center" gap={space[2]}>
              <RefreshButton busy={query.isFetching} onPress={() => void query.refetch()} />
              <Button size="sm" onPress={() => router.push('/(app)/host-event')}>
                Host an event
              </Button>
            </XStack>
          }
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -space[5] }}
          contentContainerStyle={{ paddingHorizontal: space[5], gap: space[2] }}
          role="tablist"
        >
          {CATEGORIES.map((entry) => (
            <Chip
              key={entry}
              label={entry}
              selected={category === entry}
              onPress={() => setCategory(entry)}
            />
          ))}
        </ScrollView>
      </YStack>
    ),
    [category, setCategory, query.isFetching, query.refetch],
  );

  if (query.isError) {
    return (
      <View
        style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top + space[6] }}
      >
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + space[6],
        paddingBottom: insets.bottom + 96,
        paddingHorizontal: space[5],
        gap: space[4],
      }}
      data={query.data ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={{ marginBottom: space[3] }}
      renderItem={({ item }) => (
        <EventCard
          event={item}
          rsvpPending={pendingId === item.id}
          onPress={() => router.push(`/(app)/event/${item.id}`)}
          onRsvp={() => handleRsvp(item)}
        />
      )}
      ListEmptyComponent={
        query.isPending ? (
          <ListSkeleton count={4} height={180} />
        ) : (
          <EmptyState
            title="Nothing on the board yet"
            description={`No ${category === 'All' ? '' : `${category.toLowerCase()} `}events this month.`}
            actionLabel="Propose one"
            onAction={() => router.push('/(app)/host-event')}
          />
        )
      }
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={palette.accent}
          colors={[palette.accent]}
        />
      }
      showsVerticalScrollIndicator={false}
      // Render a little past the viewport so a fast flick does not reveal
      // blank cells, without paying to mount the whole month up front.
      windowSize={7}
      removeClippedSubviews
      initialNumToRender={5}
      maxToRenderPerBatch={5}
    />
  );
}
