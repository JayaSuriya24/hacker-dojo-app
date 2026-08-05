import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Button, Card, ErrorState, ListSkeleton, Text } from '~/components/ui';
import {
  useAvailability,
  useCreateBooking,
  useRescheduleBooking,
  useResources,
} from '~/features/booking/hooks/useBooking';
import { scheduleBookingReminder } from '~/hooks/useNotifications';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { nextDays, toDateKey } from '~/utils/format';
import { radius, space } from '~/theme/tokens';

/**
 * The booking sheet.
 *
 * Reads as a checklist because it is one: pick a day, pick a start, set a
 * duration, confirm the safety rules. The confirm button stays disabled until
 * every acknowledgement is ticked — the shop rules are the reason the Dojo can
 * let members run a laser cutter unsupervised, so they are a gate rather than
 * fine print.
 */
export default function BookingSheet() {
  const { id, bookingId } = useLocalSearchParams<{ id: string; bookingId?: string }>();
  const palette = usePalette();

  const hardware = useResources('hardware');
  const rooms = useResources('room');
  const resource = [...(hardware.data ?? []), ...(rooms.data ?? [])].find(
    (entry) => entry.id === id,
  );

  const days = useMemo(() => nextDays(7), []);
  const [dayKey, setDayKey] = useState(() => toDateKey(new Date()));
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [hours, setHours] = useState(2);
  const [acknowledged, setAcknowledged] = useState([false, false, false]);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const availability = useAvailability(id ?? null, dayKey);
  const createBooking = useCreateBooking();
  const rescheduleBooking = useRescheduleBooking();

  const isRoom = resource?.kind === 'room';
  const maxHours = resource ? Math.floor(resource.max_duration_minutes / 60) : 4;
  const minHours = resource ? Math.max(1, Math.floor(resource.min_duration_minutes / 60)) : 1;

  const checklist = isRoom
    ? [
        'I will release the room if my meeting ends early.',
        'I will keep calls under the posted volume policy.',
        'I will leave the whiteboard clean.',
      ]
    : [
        'I have completed the safety training for this machine.',
        'I will not leave the machine running unattended.',
        'I will clean the bench and log material use when I am done.',
      ];

  const allAcknowledged = acknowledged.every(Boolean);
  const canConfirm = Boolean(startsAt) && allAcknowledged;
  const pending = createBooking.isPending || rescheduleBooking.isPending;

  const confirm = useCallback(async () => {
    if (!startsAt || !id || !canConfirm) return;
    setError(null);

    try {
      const booking = bookingId
        ? await rescheduleBooking.mutateAsync({
            id: bookingId,
            resourceId: id,
            startsAt,
            durationHours: hours,
          })
        : await createBooking.mutateAsync({ resourceId: id, startsAt, durationHours: hours });

      setReference(booking.reference);

      // A local reminder, so it fires even if the device is offline at the time.
      void scheduleBookingReminder({
        bookingId: booking.id,
        resourceName: booking.resourceName,
        startsAt: new Date(booking.startsAt),
      });
    } catch (caught) {
      // The most likely failure is a lost race for the slot (409 slot_taken).
      // Refetching availability means the grid the member looks at next is
      // accurate rather than still showing the slot as free.
      setError(userMessage(caught));
      void availability.refetch();
      setStartsAt(null);
    }
  }, [startsAt, id, canConfirm, bookingId, hours, createBooking, rescheduleBooking, availability]);

  if (reference) {
    return (
      <SheetScreen eyebrow="Confirmed" title="Reserved">
        <YStack gap={space[5]} alignItems="center" paddingVertical={space[8]}>
          <Text variant="heading" tone="accent">
            {reference}
          </Text>
          <Text variant="small" tone="muted" center>
            {resource?.name} · {hours}h. We will remind you 15 minutes before it starts.
          </Text>

          <YStack gap={space[3]} alignSelf="stretch" marginTop={space[4]}>
            <Button
              variant="primary"
              fullWidth
              onPress={() => {
                router.back();
                router.push('/(app)/(tabs)/book');
              }}
            >
              See my bookings
            </Button>
            <Button variant="ghost" fullWidth onPress={() => router.back()}>
              Done
            </Button>
          </YStack>
        </YStack>
      </SheetScreen>
    );
  }

  if (!resource) {
    return (
      <SheetScreen title="Booking">
        {hardware.isPending || rooms.isPending ? (
          <ListSkeleton count={3} height={80} />
        ) : (
          <ErrorState error={new Error('That resource is no longer listed.')} />
        )}
      </SheetScreen>
    );
  }

  return (
    <SheetScreen
      eyebrow={isRoom ? 'Room booking' : 'Hardware booking'}
      title={resource.name}
      footer={
        <Button
          variant="solid"
          size="lg"
          fullWidth
          loading={pending}
          disabled={!canConfirm || pending}
          onPress={() => void confirm()}
        >
          {pending
            ? 'Reserving…'
            : !startsAt
              ? 'Pick a time to continue'
              : !allAcknowledged
                ? 'Confirm all items above'
                : bookingId
                  ? 'Move reservation'
                  : 'Confirm reservation'}
        </Button>
      }
    >
      <YStack gap={space[6]}>
        {error ? (
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={{
              backgroundColor: palette.errorTint,
              borderWidth: 1,
              borderColor: palette.error,
              borderRadius: radius.md,
              padding: space[4],
            }}
          >
            <Text variant="small" tone="error">
              {error}
            </Text>
          </View>
        ) : null}

        {/* ---- Day ------------------------------------------------------- */}
        <YStack gap={space[3]}>
          <Text variant="eyebrow" tone="subtle">
            Day
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -space[5] }}
            contentContainerStyle={{ paddingHorizontal: space[5], gap: space[2] }}
          >
            {days.map((day) => {
              const selected = day.key === dayKey;
              return (
                <Pressable
                  key={day.key}
                  onPress={() => {
                    setDayKey(day.key);
                    setStartsAt(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={day.date.toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                  accessibilityState={{ selected }}
                  style={{
                    minWidth: 52,
                    minHeight: 56,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: selected ? palette.accent : palette.border,
                    backgroundColor: selected ? palette.accentTint : 'transparent',
                  }}
                >
                  <Text variant="caption" tone={selected ? 'accent' : 'subtle'}>
                    {day.label}
                  </Text>
                  <Text variant="mono" tone={selected ? 'accent' : 'default'}>
                    {day.day}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </YStack>

        {/* ---- Start time ------------------------------------------------ */}
        <YStack gap={space[3]}>
          <Text variant="eyebrow" tone="subtle">
            Start time
          </Text>

          {availability.isPending ? (
            <ListSkeleton count={2} height={44} />
          ) : availability.isError ? (
            <ErrorState error={availability.error} onRetry={() => void availability.refetch()} />
          ) : (
            <XStack flexWrap="wrap" gap={space[2]}>
              {(availability.data ?? []).map((slot) => {
                const selected = slot.startsAt === startsAt;
                return (
                  <Pressable
                    key={slot.startsAt}
                    onPress={() => slot.available && setStartsAt(slot.startsAt)}
                    disabled={!slot.available}
                    accessibilityRole="button"
                    accessibilityLabel={`${slot.label}${slot.available ? '' : ', unavailable'}`}
                    accessibilityState={{ selected, disabled: !slot.available }}
                    style={{
                      width: '23%',
                      minHeight: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: selected ? palette.accent : palette.border,
                      backgroundColor: selected ? palette.accentTintStrong : 'transparent',
                      opacity: slot.available ? 1 : 0.4,
                    }}
                  >
                    <Text
                      variant="mono"
                      tone={selected ? 'accent' : slot.available ? 'muted' : 'subtle'}
                      // A strikethrough carries "taken" without relying on the
                      // dimmed colour alone.
                      textDecorationLine={slot.available ? 'none' : 'line-through'}
                    >
                      {slot.label}
                    </Text>
                  </Pressable>
                );
              })}
            </XStack>
          )}
        </YStack>

        {/* ---- Duration -------------------------------------------------- */}
        <XStack alignItems="center" gap={space[4]}>
          <YStack flex={1} gap={space[1]}>
            <Text variant="body">Duration</Text>
            <Text variant="caption" tone="subtle">
              {minHours}–{maxHours} hours per reservation
            </Text>
          </YStack>

          <XStack
            alignItems="center"
            gap={space[3]}
            borderWidth={1}
            borderColor="$borderColor"
            borderRadius={radius.md}
            padding={space[1]}
          >
            <Button
              variant="ghost"
              size="sm"
              haptic="none"
              disabled={hours <= minHours}
              accessibilityLabel="Decrease duration"
              onPress={() => setHours((current) => Math.max(minHours, current - 1))}
            >
              −
            </Button>
            <Text
              variant="mono"
              minWidth={40}
              textAlign="center"
              accessibilityLabel={`${hours} hours`}
            >
              {hours}h
            </Text>
            <Button
              variant="ghost"
              size="sm"
              haptic="none"
              disabled={hours >= maxHours}
              accessibilityLabel="Increase duration"
              onPress={() => setHours((current) => Math.min(maxHours, current + 1))}
            >
              +
            </Button>
          </XStack>
        </XStack>

        {/* ---- Acknowledgements ------------------------------------------ */}
        <YStack gap={space[3]}>
          <Text variant="eyebrow" tone="subtle">
            Before you book
          </Text>

          {checklist.map((item, index) => {
            const checked = acknowledged[index] ?? false;

            return (
              <Pressable
                key={item}
                onPress={() =>
                  setAcknowledged((current) =>
                    current.map((value, position) => (position === index ? !value : value)),
                  )
                }
                accessibilityRole="checkbox"
                accessibilityLabel={item}
                accessibilityState={{ checked }}
              >
                <Card
                  padded="tight"
                  flexDirection="row"
                  gap={space[3]}
                  alignItems="flex-start"
                  borderColor={checked ? '$accentBorder' : '$borderColor'}
                >
                  <View
                    style={{
                      width: 19,
                      height: 19,
                      marginTop: 1,
                      borderRadius: radius.sm + 1,
                      borderWidth: 1,
                      borderColor: checked ? palette.accent : palette.borderStrong,
                      backgroundColor: checked ? palette.accent : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {checked ? (
                      <Text variant="caption" tone="onAccent">
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="small" flex={1}>
                    {item}
                  </Text>
                </Card>
              </Pressable>
            );
          })}
        </YStack>
      </YStack>
    </SheetScreen>
  );
}
