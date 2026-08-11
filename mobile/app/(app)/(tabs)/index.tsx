import { useCallback, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { XStack, YStack } from 'tamagui';
import {
  Button,
  Card,
  Divider,
  ListSkeleton,
  ProgressRing,
  Screen,
  Section,
  StatusPill,
  Text,
} from '~/components/ui';
import { useMe } from '~/features/profile/hooks/useProfile';
import { useOccupancy, useSiteSettings } from '~/features/community/hooks/useCommunity';
import { useEvents } from '~/features/events/hooks/useEvents';
import {
  useCheckIn,
  useEndSession,
  useExtendSession,
  useLiveSession,
  useResources,
} from '~/features/booking/hooks/useBooking';
import { DigitalKey } from '~/features/home/components/DigitalKey';
import { LiveSessionCard } from '~/features/home/components/LiveSessionCard';
import { GreetingHeading } from '~/features/home/components/GreetingHeading';
import { CheckInCard } from '~/features/home/components/CheckInCard';
import { dojo } from '~/constants/config';
import { firstNameOf, formatTime, greetingFor } from '~/utils/format';
import { space } from '~/theme/tokens';

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

  const [wifiCopied, setWifiCopied] = useState(false);

  const isMember = me?.isActiveMember ?? false;

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
  }, [occupancy, todayEvents, liveSession, settings]);

  /**
   * Copy the Wi-Fi password.
   *
   * The SSID and password used to be string literals in this file, which put
   * the password in every installed copy of the app and made rotating it an App
   * Store release. They are members-only rows now, so a guest simply has no
   * password to copy and the card says so.
   */
  const copyWifi = useCallback(async () => {
    const password = settings.data?.wifiPassword;
    if (!password) return;

    await Clipboard.setStringAsync(password);
    setWifiCopied(true);
    setTimeout(() => setWifiCopied(false), 2000);
  }, [settings.data?.wifiPassword]);

  const freeRooms = (rooms.data ?? []).filter((room) => room.status === 'available').length;
  const totalRooms = rooms.data?.length ?? 0;

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
            <Text variant="small" tone="subtle" center>
              Book a 30-minute tour to visit the space.
            </Text>
            <XStack gap={space[3]} marginTop={space[2]}>
              <Button onPress={() => router.push('/(app)/tour')}>Take a tour</Button>
              <Button variant="secondary" onPress={() => router.push('/(app)/(tabs)/dojo')}>
                View membership
              </Button>
            </XStack>
          </Card>
        )}
      </YStack>

      {/* ---- On the floor: check in, or the live session ------------------ */}
      {isMember ? (
        <YStack marginTop={space[4]}>
          {liveSession.data ? (
            <LiveSessionCard
              session={liveSession.data}
              extending={extendSession.isPending}
              ending={endSession.isPending}
              onExtend={() => extendSession.mutate()}
              onEnd={() => endSession.mutate()}
            />
          ) : liveSession.isPending ? null : (
            // Held back until the query settles. Rendering the prompt against an
            // unknown session state would show "Check in" to someone already
            // checked in, for as long as the request takes.
            <CheckInCard busy={checkIn.isPending} onCheckIn={() => checkIn.mutate({})} />
          )}
        </YStack>
      ) : null}

      {/* ---- Quick access ------------------------------------------------ */}
      <Section title="Quick access">
        <XStack gap={space[3]} flexWrap="wrap">
          <YStack flex={1} minWidth="45%">
            <Pressable
              onPress={() => void copyWifi()}
              disabled={!settings.data?.wifiPassword}
              role="button"
              aria-label="Copy the Wi-Fi password"
              aria-disabled={!settings.data?.wifiPassword}
              accessibilityHint={
                settings.data?.wifiPassword
                  ? wifiCopied
                    ? 'Copied to your clipboard'
                    : 'Copies the password to your clipboard'
                  : 'Wi-Fi access is a member benefit'
              }
            >
              <Card padded="tight" gap={space[1]}>
                <Text variant="small">Wi-Fi</Text>
                <Text variant="mono" tone="subtle">
                  {settings.data?.wifiSsid ?? '—'}
                </Text>
                <Text variant="caption" tone="accent">
                  {!settings.data?.wifiPassword
                    ? 'Members only'
                    : wifiCopied
                      ? 'Copied'
                      : 'Tap to copy password'}
                </Text>
              </Card>
            </Pressable>
          </YStack>

          <YStack flex={1} minWidth="45%">
            <Card padded="tight" gap={space[1]}>
              <Text variant="small">Hardware Lab</Text>
              <Text variant="caption" tone="subtle">
                Steward on floor
              </Text>
              <Text variant="caption" tone="accent">
                Open until 9 PM
              </Text>
            </Card>
          </YStack>

          <YStack flex={1} minWidth="100%">
            <Pressable
              onPress={() => router.push('/(app)/(tabs)/book')}
              role="button"
              aria-label={`Meeting rooms, ${freeRooms} of ${totalRooms} free now`}
            >
              <Card padded="tight" flexDirection="row" alignItems="center" gap={space[4]}>
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
                aria-label={`${event.title}, ${formatTime(event.startsAt)} in ${event.roomName}`}
              >
                <Card width={212} padded="tight" gap={space[2]}>
                  <Text variant="mono" tone="accent">
                    {formatTime(event.startsAt)} · {event.roomName}
                  </Text>
                  <Text variant="subtitle" numberOfLines={2}>
                    {event.title}
                  </Text>
                  <Text variant="caption" tone="subtle">
                    {event.hostName}
                  </Text>
                  {event.rsvpStatus === 'going' ? (
                    <StatusPill label="Going" tone="accent" />
                  ) : event.atCapacity ? (
                    <StatusPill label="At capacity" tone="error" />
                  ) : null}
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
      <Section title="Getting here">
        <Card tone="alt">
          <Text variant="subtitle">{dojo.addressLine1}</Text>
          <Text variant="small" tone="subtle">
            {dojo.addressLine2}
          </Text>
          <Divider spacing={space[3]} />
          <Text variant="small" tone="muted">
            {dojo.transit}
          </Text>
        </Card>
      </Section>
    </Screen>
  );
}
