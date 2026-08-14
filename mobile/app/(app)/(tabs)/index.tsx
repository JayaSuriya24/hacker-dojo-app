import { useCallback } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import {
  Button,
  Card,
  ListSkeleton,
  ProgressRing,
  Screen,
  Section,
  StatusPill,
  Text,
} from '~/components/ui';
import { useMe, useShouldOfferTour } from '~/features/profile/hooks/useProfile';
import { useOccupancy, useSiteSettings } from '~/features/community/hooks/useCommunity';
import { useEvents } from '~/features/events/hooks/useEvents';
import {
  useCheckIn,
  useEndSession,
  useExtendSession,
  useLiveSession,
  useMyBookings,
  useResources,
  useRoomSchedule,
} from '~/features/booking/hooks/useBooking';
import { usePreferencesStore } from '~/store/preferences.store';
import { DigitalKey } from '~/features/home/components/DigitalKey';
import { LiveSessionCard } from '~/features/home/components/LiveSessionCard';
import { CheckInToggle } from '~/features/home/components/CheckInToggle';
import { WifiCard } from '~/features/home/components/WifiCard';
import { GettingHereCard } from '~/features/home/components/GettingHereCard';
import { GreetingHeading } from '~/features/home/components/GreetingHeading';
import { dojo } from '~/constants/config';
import { firstNameOf, formatTime, greetingFor } from '~/utils/format';
import { lineHeight, space } from '~/theme/tokens';

/**
 * The pill row on an event card: `StatusPill`'s vertical padding either side of
 * a caption line. Reserved even when there is no pill, so a card with one and a
 * card without still end up the same height.
 */
const PILL_ROW_HEIGHT = space[1] * 2 + lineHeight.caption;

/**
 * Home.
 *
 * The one screen a member opens without a task in mind, so it answers the three
 * standing questions — how busy is it, can I get in, what is on tonight — and
 * offers the two actions most likely to be wanted (unlock, Wi-Fi).
 *
 * Guests see the same shape with the gated cards replaced by a tour prompt,
 * rather than a screen with holes in it.
 */
export default function HomeScreen() {
  const { data: me } = useMe();
  const occupancy = useOccupancy();
  const settings = useSiteSettings();
  const todayEvents = useEvents({ today: true });
  const rooms = useResources('room');
  const liveSession = useLiveSession();
  const extendSession = useExtendSession();
  const endSession = useEndSession();
  const checkIn = useCheckIn();
  const roomSchedule = useRoomSchedule('room');
  const myBookings = useMyBookings();
  const setBookTab = usePreferencesStore((state) => state.setBookTab);

  const isMember = me?.isActiveMember ?? false;
  const showTour = useShouldOfferTour();

  /**
   * Members get the time of day; everyone else gets welcomed. Both greet by
   * name once it has loaded — someone who has signed up but not yet joined is
   * still a person the Dojo knows, and "Welcome to the Dojo" alone read as the
   * app not recognising them.
   */
  const greeting = (() => {
    const firstName = me ? firstNameOf(me.name) : '';
    if (isMember && firstName) return `${greetingFor()}, ${firstName}`;
    return firstName ? `Welcome to the Dojo, ${firstName}` : 'Welcome to the Dojo';
  })();
  const isOpen = (() => {
    const hour = new Date().getHours();
    return hour >= dojo.publicHours.opensHour && hour < dojo.publicHours.closesHour;
  })();

  const onRefresh = useCallback(() => {
    void occupancy.refetch();
    void todayEvents.refetch();
    void liveSession.refetch();
    void settings.refetch();
    void roomSchedule.refetch();
    void myBookings.refetch();
  }, [occupancy, todayEvents, liveSession, settings, roomSchedule, myBookings]);

  const reservations = roomSchedule.data ?? [];

  /**
   * A room is free right now only if nothing is booked in it right now.
   *
   * This used to count `status === 'available'` alone, which is the resource's
   * standing state — whether it exists and is not under maintenance. It says
   * nothing about the next hour, so the card cheerfully read "6 of 6 free now"
   * while the Event Hall was in the middle of somebody's meeting.
   */
  const busyNow = new Set(reservations.filter((r) => r.active).map((r) => r.resourceId));
  const freeRooms = (rooms.data ?? []).filter(
    (room) => room.status === 'available' && !busyNow.has(room.id),
  ).length;
  const totalRooms = rooms.data?.length ?? 0;

  /** Reservations still to come today, plus whatever is running now. */
  const upcomingToday = reservations.filter((r) => new Date(r.endsAt).getTime() > Date.now());

  /** The member's own bookings that fall on today, soonest first. */
  const myToday = (myBookings.data ?? [])
    .filter((booking) => {
      const start = new Date(booking.startsAt);
      const today = new Date();
      return (
        start.getFullYear() === today.getFullYear() &&
        start.getMonth() === today.getMonth() &&
        start.getDate() === today.getDate()
      );
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return (
    <Screen onRefresh={onRefresh} refreshing={occupancy.isRefetching || todayEvents.isRefetching}>
      <XStack alignItems="flex-start" gap={space[4]}>
        <YStack flex={1} gap={space[1]}>
          <Text variant="eyebrow">{dojo.addressLine1}</Text>
          <GreetingHeading text={greeting} />
          <Text variant="small" tone="subtle">
            Public hours {dojo.publicHours.opensHour} AM – {dojo.publicHours.closesHour - 12} PM
          </Text>
        </YStack>

        <StatusPill label={isOpen ? 'Open now' : 'Closed'} tone={isOpen ? 'ok' : 'neutral'} />
      </XStack>

      {/* ---- Live occupancy ---------------------------------------------- */}
      <YStack marginTop={space[5]}>
        {occupancy.isPending ? (
          <ListSkeleton count={1} height={128} />
        ) : occupancy.data ? (
          <Card>
            <XStack alignItems="center" gap={space[6]}>
              <ProgressRing
                percent={occupancy.data.percent}
                value={occupancy.data.total}
                total={occupancy.data.capacity}
              />

              <YStack flex={1} gap={space[1]}>
                <Text variant="eyebrow">Live occupancy</Text>
                <Text variant="title">
                  {occupancy.data.percent > 85
                    ? 'Near capacity'
                    : occupancy.data.percent > 60
                      ? 'Busy'
                      : 'Room to work'}
                </Text>
                <Text variant="small" tone="subtle">
                  {occupancy.data.zones.map((zone) => `${zone.name} ${zone.headCount}`).join(' · ')}
                </Text>

                {/*
                  The control sits on the dial because the count is the whole
                  reason to press it. Held back until the session query settles:
                  rendering against an unknown state offers "Check in" to
                  someone already on the floor for as long as the request takes.
                */}
                {isMember && !liveSession.isPending ? (
                  <XStack marginTop={space[2]}>
                    <CheckInToggle
                      checkedIn={Boolean(liveSession.data)}
                      busy={checkIn.isPending || endSession.isPending}
                      onToggle={() => (liveSession.data ? endSession.mutate() : checkIn.mutate({}))}
                    />
                  </XStack>
                ) : null}
              </YStack>
            </XStack>
          </Card>
        ) : null}
      </YStack>

      {/* ---- Digital key, or the guest gate ------------------------------ */}
      <YStack marginTop={space[4]}>
        {isMember ? (
          <DigitalKey />
        ) : (
          <Card tone="dashed" alignItems="center" gap={space[3]}>
            <Text variant="title" center>
              Door access is for members
            </Text>
            {/*
              Once the tour is booked the invitation becomes a reminder. Leaving
              "Book a 30-minute tour" up next to a booking that already exists
              invites a duplicate and reads as though the first one was lost.

              Keyed on `hasBookedTour` being true rather than on `showTour` being
              false, because the two are not opposites while the profile is still
              loading — `showTour` is false then, and phrasing it the other way
              announces a booking to someone who has never made one.
            */}
            <Text variant="small" tone="subtle" center>
              {me?.hasBookedTour
                ? 'Your tour is booked — ask for the steward at the front desk.'
                : 'Book a 30-minute tour to visit the space.'}
            </Text>
            <XStack gap={space[3]} marginTop={space[2]}>
              {showTour ? (
                <Button onPress={() => router.push('/(app)/tour')}>Take a tour</Button>
              ) : null}
              {/* Promoted to primary only when it is the only button left,
                  and keyed the same way as the copy above so it does not flip
                  variant once the profile lands. */}
              <Button
                variant={me?.hasBookedTour ? 'primary' : 'secondary'}
                onPress={() => router.push('/(app)/(tabs)/dojo')}
              >
                View membership
              </Button>
            </XStack>
          </Card>
        )}
      </YStack>

      {/*
        ---- Live booth session -------------------------------------------
        Only for a session that holds a resource. A plain check-in to the floor
        runs for four hours and has nothing to extend or release, so the
        countdown card would be a timer on nothing — the toggle above already
        says what state that member is in.
      */}
      {isMember && liveSession.data?.resourceKind ? (
        <YStack marginTop={space[4]}>
          <LiveSessionCard
            session={liveSession.data}
            extending={extendSession.isPending}
            ending={endSession.isPending}
            onExtend={() => extendSession.mutate()}
            onEnd={() => endSession.mutate()}
          />
        </YStack>
      ) : null}

      {/*
        ---- My bookings -------------------------------------------------
        Only when there is one. A section headed "My bookings" that is empty
        most days trains people to scroll past it, and the Book tab already
        answers "have I booked anything" for the days there is nothing.
      */}
      {isMember && myToday.length > 0 ? (
        <Section title="My bookings">
          <Card padded="tight" gap={space[3]}>
            {myToday.map((booking) => (
              <XStack key={booking.id} alignItems="center" gap={space[3]}>
                <StatusPill label="Today" tone="accent" bordered={false} />
                <YStack flex={1} gap={space[1]}>
                  <Text variant="small">{booking.resourceName}</Text>
                  <Text variant="caption" tone="subtle">
                    {booking.when}
                  </Text>
                </YStack>
              </XStack>
            ))}

            <Button
              variant="secondary"
              fullWidth
              onPress={() => {
                // Land on the segment that actually holds the reservation, so
                // the button delivers what it says rather than the Hardware
                // list the tab happens to remember from last time.
                setBookTab('mine');
                router.push('/(app)/(tabs)/book');
              }}
              aria-label="See your booking details for today"
            >
              My booking for today
            </Button>
          </Card>
        </Section>
      ) : null}

      {/* ---- Quick access ------------------------------------------------ */}
      <Section title="Quick access">
        <XStack gap={space[3]} flexWrap="wrap">
          {/*
            Full width: two networks with a username and two passwords between
            them do not fit the half-width tile the single shared password used
            to sit in.
          */}
          <YStack flex={1} minWidth="100%">
            <WifiCard settings={settings.data} />
          </YStack>

          <YStack flex={1} minWidth="100%">
            <Pressable
              onPress={() => router.push('/(app)/(tabs)/book')}
              role="button"
              aria-label={`Meeting rooms, ${freeRooms} of ${totalRooms} free now`}
            >
              <Card padded="tight" gap={space[2]}>
                <XStack alignItems="center" gap={space[4]}>
                  <YStack flex={1} gap={space[1]}>
                    <Text variant="small">Meeting rooms</Text>
                    <Text variant="caption" tone="subtle">
                      {rooms.isPending
                        ? 'Checking availability…'
                        : `${freeRooms} of ${totalRooms} free now`}
                    </Text>
                  </YStack>
                  <Text variant="title" tone="subtle">
                    ›
                  </Text>
                </XStack>

                {/*
                  Today's reservations, visible to everyone including signed-out
                  visitors. Times only — the API sends no member, deliberately:
                  that a room is spoken for is everyone's business, whose
                  meeting it is, is not.

                  Capped at three. A busy Tuesday would otherwise push the rest
                  of the home screen off the fold, and the Book tab behind this
                  card is where the full day belongs.
                */}
                {upcomingToday.length > 0 ? (
                  <YStack gap={space[1]}>
                    {upcomingToday.slice(0, 3).map((reservation) => (
                      <XStack
                        key={`${reservation.resourceId}-${reservation.startsAt}`}
                        alignItems="center"
                        gap={space[2]}
                      >
                        <StatusPill
                          label={reservation.active ? 'Now' : 'Booked'}
                          tone={reservation.active ? 'error' : 'neutral'}
                          bordered={false}
                        />
                        <YStack flex={1} gap={space[1]}>
                          <Text variant="caption" tone="subtle" numberOfLines={1}>
                            {reservation.resourceName} · {reservation.window}
                          </Text>

                          {/*
                            Only rendered when the server sent a name. It sends
                            one to active members and to nobody else, so this
                            line simply does not exist for a guest — the check
                            is not a UI-level permission, it is a null check on
                            a decision already made.
                          */}
                          {reservation.bookedBy ? (
                            <Text variant="caption" tone="muted" numberOfLines={1}>
                              {reservation.bookedBy}
                            </Text>
                          ) : null}
                        </YStack>
                      </XStack>
                    ))}

                    {upcomingToday.length > 3 ? (
                      <Text variant="caption" tone="subtle">
                        +{upcomingToday.length - 3} more today
                      </Text>
                    ) : null}
                  </YStack>
                ) : null}
              </Card>
            </Pressable>
          </YStack>
        </XStack>
      </Section>

      {/* ---- Today's events --------------------------------------------- */}
      <Section
        title="Today at the Dojo"
        action={
          <Pressable
            onPress={() => router.push('/(app)/(tabs)/events')}
            role="link"
            aria-label="See all events"
            hitSlop={8}
          >
            <Text variant="small" tone="muted">
              All events ›
            </Text>
          </Pressable>
        }
      >
        {todayEvents.isPending ? (
          <ListSkeleton count={1} height={120} />
        ) : todayEvents.data?.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // Negative margin plus matching padding lets the rail bleed to the
            // screen edge while the first card still aligns with the copy above.
            style={{ marginHorizontal: -space[5] }}
            contentContainerStyle={{ paddingHorizontal: space[5], gap: space[3] }}
          >
            {todayEvents.data.map((event) => (
              <Pressable
                key={event.id}
                onPress={() => router.push(`/(app)/event/${event.id}`)}
                role="button"
                aria-label={`${event.title}, ${formatTime(event.startsAt)} in ${event.roomName}. ${event.goingCount} of ${event.capacity} going.`}
              >
                {/*
                  Every card the same height, without a fixed one.

                  Three things made them differ: a long room name wrapped the
                  meta line to two, titles ran to one line or two, and the pill
                  only exists for some events. Each is pinned below — the two
                  single-line rows are capped, the title reserves its two lines
                  as a FLOOR, and the pill always gets its row whether or not
                  there is a pill in it.

                  Floors rather than a fixed card height on purpose: at a large
                  accessibility font scale a hard height clips the title, and a
                  clipped event name is worse than a rail whose cards grew.
                */}
                <Card width={212} padded="tight" gap={space[2]}>
                  <Text variant="mono" tone="accent" numberOfLines={1}>
                    {formatTime(event.startsAt)} · {event.roomName}
                  </Text>
                  <Text variant="subtitle" numberOfLines={2} minHeight={lineHeight.subtitle * 2}>
                    {event.title}
                  </Text>
                  <Text variant="caption" tone="subtle" numberOfLines={1}>
                    {event.hostName}
                  </Text>
                  {/*
                    Two different facts, so both are shown: the pill is YOUR
                    status, the count is everyone's. A card that only carried
                    the pill told a member nothing about whether the room would
                    be busy — and told someone who had not RSVP'd nothing at
                    all, which is precisely who the number is for.

                    Same phrasing as the Events tab rather than a second wording
                    for the same fact.
                  */}
                  <XStack minHeight={PILL_ROW_HEIGHT} alignItems="center" gap={space[2]}>
                    {event.rsvpStatus === 'going' ? (
                      <StatusPill label="Going" tone="accent" />
                    ) : event.atCapacity ? (
                      <StatusPill label="At capacity" tone="error" />
                    ) : null}

                    <Text variant="caption" tone="subtle" marginLeft="auto">
                      {event.goingCount} going
                    </Text>
                  </XStack>
                </Card>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Card tone="alt">
            <Text variant="small" tone="subtle">
              Nothing scheduled today. The floor is all yours.
            </Text>
          </Card>
        )}
      </Section>

      {/* ---- Getting here ------------------------------------------------ */}
      {/* Untitled Section: the heading is inside the card, beside the map. */}
      <Section>
        <GettingHereCard />
      </Section>
    </Screen>
  );
}
