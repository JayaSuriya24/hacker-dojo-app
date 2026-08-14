import { useCallback, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Button, Card, Chip, ErrorState, ListSkeleton, Text } from '~/components/ui';
import { useCancelRsvp, useEvent, useRsvp } from '~/features/events/hooks/useEvents';
import { EventCover } from '~/features/events/components/EventCover';
import { SeriesSchedule } from '~/features/events/components/SeriesSchedule';
import { addEventToCalendar } from '~/features/events/services/calendar';
import { formatDateRange } from '~/utils/format';
import { space } from '~/theme/tokens';

export default function EventSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useEvent(id ?? '');
  const rsvp = useRsvp();
  const cancelRsvp = useCancelRsvp();

  /*
   * Calendar state lives here rather than in the panel below, because these
   * hooks must run before the loading and error branches return — React
   * requires the same hooks in the same order on every render.
   */
  const [addingToCalendar, setAddingToCalendar] = useState(false);
  const [added, setAdded] = useState(false);
  const [addedVia, setAddedVia] = useState<'device' | 'download' | 'existing' | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  /*
   * A second guard against double-adds, separate from the disabled button.
   * `setAddingToCalendar(true)` does not take effect until the next render, so
   * two taps inside the same frame both pass the state check and both write.
   * A ref changes synchronously, which is what makes it the right tool here.
   */
  const inFlight = useRef(false);

  const event = query.data;

  const handleAddToCalendar = useCallback(async () => {
    if (!event || inFlight.current) return;

    inFlight.current = true;
    setAddingToCalendar(true);
    // Cleared up front so a retry after a denial does not sit under the old
    // error while it runs.
    setCalendarError(null);

    const outcome = await addEventToCalendar({
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      roomName: event.roomName,
      description: event.description,
    });

    inFlight.current = false;
    setAddingToCalendar(false);

    if (outcome.ok) {
      setAdded(true);
      setAddedVia(outcome.via);
      return;
    }

    // Left un-added on purpose: the button returns to "Add to Calendar" so the
    // failure is retryable, which a success state would quietly prevent.
    setCalendarError(outcome.message);
  }, [event]);

  if (query.isPending) {
    return (
      <SheetScreen title="Event">
        <ListSkeleton count={3} height={80} />
      </SheetScreen>
    );
  }

  if (query.isError || !event) {
    return (
      <SheetScreen title="Event">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </SheetScreen>
    );
  }

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
        <EventCover path={event.coverPath} title={event.title} />

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

        {event.series ? <SeriesSchedule series={event.series} currentEventId={event.id} /> : null}

        {event.description ? (
          <Text variant="small" tone="muted">
            {event.description}
          </Text>
        ) : null}

        {/*
          Shown only once the RSVP exists, so there is something to confirm.

          This replaced a QR-style check-in badge. The badge was only useful in
          the few seconds at the door; what a member wants immediately after
          saying "I'm going" is not to forget, which is what the calendar is
          for. The RSVP itself is untouched — the attendance count, the
          waitlist and the check-in code the server issues all still work
          exactly as before; only this panel changed.
        */}
        {going ? (
          <YStack gap={space[3]} marginTop={space[3]}>
            <Text variant="eyebrow">You&apos;re confirmed</Text>

            <Button
              variant={added ? 'secondary' : 'primary'}
              fullWidth
              loading={addingToCalendar}
              disabled={addingToCalendar || added}
              onPress={() => void handleAddToCalendar()}
              aria-label={added ? 'Added to your calendar' : 'Add this event to your calendar'}
            >
              {added ? 'Added to your calendar' : 'Add to Calendar'}
            </Button>

            {calendarError ? (
              <Text variant="small" tone="error" aria-live="polite">
                {calendarError}
              </Text>
            ) : added ? (
              <Text variant="caption" tone="subtle" aria-live="polite">
                {addedVia === 'download'
                  ? 'Invite downloaded — open it to add the event to your calendar.'
                  : addedVia === 'existing'
                    ? 'This event was already on your calendar.'
                    : `Saved to your calendar for ${event.roomName}.`}
              </Text>
            ) : (
              <Text variant="caption" tone="subtle">
                We&apos;ll put the time, room and description straight into your calendar.
              </Text>
            )}
          </YStack>
        ) : null}
      </YStack>
    </SheetScreen>
  );
}
