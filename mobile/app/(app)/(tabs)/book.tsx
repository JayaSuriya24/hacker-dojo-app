import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Screen,
  ScreenHeader,
  Segmented,
  StatusPill,
  Text,
} from '~/components/ui';
import { useCancelBooking, useMyBookings, useResources } from '~/features/booking/hooks/useBooking';
import { useMe } from '~/features/profile/hooks/useProfile';
import { usePreferencesStore } from '~/store/preferences.store';
import { formatRelative } from '~/utils/format';
import { space } from '~/theme/tokens';
import type { Resource, ResourceStatus } from '~/types/domain';

const STATUS_TONE: Record<ResourceStatus, 'ok' | 'warn' | 'error'> = {
  available: 'ok',
  in_use: 'warn',
  maintenance: 'error',
};

const STATUS_LABEL: Record<ResourceStatus, string> = {
  available: 'Available',
  in_use: 'In use',
  maintenance: 'Maintenance',
};

/**
 * Book — hardware, rooms, and the member's own reservations.
 *
 * The equipment list is public: someone deciding whether to join should be able
 * to see there is a laser cutter. Booking is not, and the guest banner says so
 * rather than the buttons silently failing.
 */
export default function BookScreen() {
  const { data: me } = useMe();
  const tab = usePreferencesStore((state) => state.bookTab);
  const setTab = usePreferencesStore((state) => state.setBookTab);

  const isMember = me?.isActiveMember ?? false;

  const hardware = useResources('hardware');
  const rooms = useResources('room');
  const bookings = useMyBookings();
  const cancelBooking = useCancelBooking();

  const active = tab === 'hardware' ? hardware : tab === 'rooms' ? rooms : bookings;

  const onRefresh = useCallback(() => {
    void active.refetch();
  }, [active]);

  const openBooking = useCallback(
    (resource: Resource) => {
      if (!isMember) {
        router.push('/(app)/tour');
        return;
      }
      if (resource.status === 'maintenance') return;
      router.push(`/(app)/book/${resource.id}`);
    },
    [isMember],
  );

  const renderResource = (resource: Resource) => (
    <Pressable
      key={resource.id}
      onPress={() => openBooking(resource)}
      disabled={resource.status === 'maintenance'}
      role="button"
      aria-label={`${resource.name}. ${STATUS_LABEL[resource.status]}.${
        resource.requiresCert ? ' Certification required.' : ''
      }`}
      accessibilityHint={
        resource.status === 'maintenance' ? 'Unavailable' : 'Opens the booking sheet'
      }
      aria-disabled={resource.status === 'maintenance'}
    >
      <Card interactive opacity={resource.status === 'maintenance' ? 0.6 : 1}>
        <XStack alignItems="center" gap={space[3]}>
          <Text variant="subtitle" flex={1} numberOfLines={1}>
            {resource.name}
          </Text>
          <StatusPill
            label={STATUS_LABEL[resource.status]}
            tone={STATUS_TONE[resource.status]}
            bordered={false}
          />
        </XStack>

        {resource.model || resource.amenities ? (
          <Text variant="small" tone="subtle">
            {resource.model ?? resource.amenities}
          </Text>
        ) : null}

        <XStack gap={space[2]} marginTop={space[2]} flexWrap="wrap" alignItems="center">
          {resource.seats ? (
            <Chip label={`Seats ${resource.seats}`} readOnly tone="neutral" />
          ) : null}
          <Chip
            label={
              new Date(resource.freeFrom).getTime() <= Date.now()
                ? 'Free now'
                : `Free ${formatRelative(resource.freeFrom)}`
            }
            readOnly
            tone="neutral"
          />
          {resource.requiresCert ? (
            <Chip label="Certification required" readOnly tone="warn" />
          ) : null}
        </XStack>
      </Card>
    </Pressable>
  );

  return (
    <Screen onRefresh={onRefresh} refreshing={active.isRefetching}>
      <ScreenHeader eyebrow="Reserve" title="Hardware & space" />

      <Segmented
        aria-label="What to book"
        options={[
          { value: 'hardware', label: 'Hardware' },
          { value: 'rooms', label: 'Rooms' },
          { value: 'mine', label: 'My bookings' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {!isMember ? (
        <YStack marginTop={space[4]}>
          <Card tone="dashed" flexDirection="row" alignItems="center" gap={space[4]}>
            <Text variant="small" tone="muted" flex={1}>
              Booking is a member benefit. Tour first, then pick a plan.
            </Text>
            <Button size="sm" onPress={() => router.push('/(app)/tour')}>
              Tour
            </Button>
          </Card>
        </YStack>
      ) : null}

      <YStack gap={space[4]} marginTop={space[5]}>
        {active.isError ? (
          <ErrorState error={active.error} onRetry={() => void active.refetch()} />
        ) : active.isPending ? (
          <ListSkeleton count={4} height={120} />
        ) : tab === 'hardware' ? (
          (hardware.data ?? []).map(renderResource)
        ) : tab === 'rooms' ? (
          (rooms.data ?? []).map(renderResource)
        ) : (bookings.data ?? []).length === 0 ? (
          <EmptyState
            title="No reservations"
            description="Book a machine or a room and it shows up here."
            actionLabel="Browse hardware"
            onAction={() => setTab('hardware')}
          />
        ) : (
          (bookings.data ?? []).map((booking) => (
            <Card key={booking.id}>
              <XStack alignItems="baseline" gap={space[3]}>
                <Text variant="subtitle" flex={1} numberOfLines={1}>
                  {booking.resourceName}
                </Text>
                <Text variant="mono" tone="subtle">
                  {booking.reference}
                </Text>
              </XStack>

              <Text variant="small" tone="muted">
                {booking.when}
              </Text>

              <XStack gap={space[3]} marginTop={space[4]}>
                <YStack flex={1}>
                  <Button
                    variant="secondary"
                    fullWidth
                    onPress={() =>
                      router.push({
                        pathname: `/(app)/book/${booking.resourceId}`,
                        params: { bookingId: booking.id },
                      })
                    }
                    aria-label={`Modify your reservation for ${booking.resourceName}`}
                  >
                    Modify
                  </Button>
                </YStack>
                <YStack flex={1}>
                  <Button
                    variant="destructive"
                    fullWidth
                    loading={cancelBooking.isPending && cancelBooking.variables === booking.id}
                    onPress={() => cancelBooking.mutate(booking.id)}
                    aria-label={`Cancel your reservation for ${booking.resourceName}`}
                  >
                    Cancel
                  </Button>
                </YStack>
              </XStack>
            </Card>
          ))
        )}
      </YStack>
    </Screen>
  );
}
