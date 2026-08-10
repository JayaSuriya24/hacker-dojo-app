import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Button, Text } from '~/components/ui';
import { useBookTour } from '~/features/community/hooks/useCommunity';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { nextDays } from '~/utils/format';
import { radius, space } from '~/theme/tokens';

const TIMES = [
  { label: '1:00 PM', hour: 13, minute: 0 },
  { label: '2:30 PM', hour: 14, minute: 30 },
  { label: '4:00 PM', hour: 16, minute: 0 },
  { label: '5:30 PM', hour: 17, minute: 30 },
  { label: '6:30 PM', hour: 18, minute: 30 },
  { label: '7:30 PM', hour: 19, minute: 30 },
];

/**
 * Book a tour.
 *
 * The one conversion surface a guest can complete without an account or a card,
 * so it is kept to two taps: a day and a time.
 */
export default function TourSheet() {
  const palette = usePalette();
  const bookTour = useBookTour();

  const days = useMemo(() => nextDays(5), []);
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [timeIndex, setTimeIndex] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = dayIndex !== null && timeIndex !== null;

  const confirm = async () => {
    if (dayIndex === null || timeIndex === null) return;
    setError(null);

    const day = days[dayIndex];
    const time = TIMES[timeIndex];
    if (!day || !time) return;

    const scheduledFor = new Date(day.date);
    scheduledFor.setHours(time.hour, time.minute, 0, 0);

    try {
      // This sheet lives inside the authenticated group, so the tour attaches
      // to the caller's profile server-side. The guest fields on the endpoint
      // exist for the marketing site, which books tours without an account.
      await bookTour.mutateAsync({ scheduledFor: scheduledFor.toISOString() });
      setConfirmed(
        `${day.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} at ${time.label}`,
      );
    } catch (caught) {
      setError(userMessage(caught));
    }
  };

  if (confirmed) {
    return (
      <SheetScreen eyebrow="Confirmed" title="Tour booked">
        <YStack gap={space[5]} alignItems="center" paddingVertical={space[8]}>
          <Text variant="title" center>
            {confirmed}
          </Text>
          <Text variant="small" tone="muted" center>
            Ask for the steward at the front desk. It takes about thirty minutes.
          </Text>
          <YStack alignSelf="stretch" marginTop={space[4]}>
            <Button variant="primary" fullWidth onPress={() => router.back()}>
              Done
            </Button>
          </YStack>
        </YStack>
      </SheetScreen>
    );
  }

  return (
    <SheetScreen
      eyebrow="30 minutes, free"
      title="Take a tour"
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={bookTour.isPending}
          disabled={!canConfirm || bookTour.isPending}
          onPress={() => void confirm()}
        >
          {bookTour.isPending ? 'Booking…' : canConfirm ? 'Book my tour' : 'Pick a day and time'}
        </Button>
      }
    >
      <YStack gap={space[6]}>
        {error ? (
          <View
            aria-live="assertive"
            role="alert"
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
            {days.map((day, index) => {
              const selected = dayIndex === index;
              return (
                <Pressable
                  key={day.key}
                  onPress={() => setDayIndex(index)}
                  role="button"
                  aria-label={day.date.toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                  aria-selected={selected}
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

        <YStack gap={space[3]}>
          <Text variant="eyebrow" tone="subtle">
            Time
          </Text>
          <XStack gap={space[2]} flexWrap="wrap">
            {TIMES.map((time, index) => {
              const selected = timeIndex === index;
              return (
                <Pressable
                  key={time.label}
                  onPress={() => setTimeIndex(index)}
                  role="button"
                  aria-label={time.label}
                  aria-selected={selected}
                  style={{
                    width: '31.5%',
                    minHeight: 46,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: selected ? palette.accent : palette.border,
                    backgroundColor: selected ? palette.accentTintStrong : 'transparent',
                  }}
                >
                  <Text variant="small" tone={selected ? 'accent' : 'muted'}>
                    {time.label}
                  </Text>
                </Pressable>
              );
            })}
          </XStack>
        </YStack>
      </YStack>
    </SheetScreen>
  );
}
