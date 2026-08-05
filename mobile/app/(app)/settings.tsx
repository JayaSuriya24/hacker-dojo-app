import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack } from 'tamagui';
import {
  Avatar,
  Button,
  Card,
  Chip,
  ListSkeleton,
  Screen,
  Section,
  Segmented,
  Text,
  Toggle,
} from '~/components/ui';
import {
  useMe,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  useUpdateProfile,
} from '~/features/profile/hooks/useProfile';
import { useRegisterPushToken } from '~/hooks/useNotifications';
import { authService } from '~/features/auth/services/auth.service';
import { usePreferencesStore } from '~/store/preferences.store';
import { usePalette } from '~/providers/ThemeProvider';
import { dojo } from '~/constants/config';
import { space } from '~/theme/tokens';

/**
 * Profile and settings.
 *
 * Sign-out asks for confirmation. It is the one action here that cannot be
 * undone with a tap, and on a shared device an accidental sign-out means
 * someone has to find their password again.
 */
export default function SettingsScreen() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  const { data: me, isPending } = useMe();
  const notifications = useNotificationPreferences();
  const updateNotifications = useUpdateNotificationPreferences();
  const updateProfile = useUpdateProfile();
  const registerPush = useRegisterPushToken();

  const appearance = usePreferencesStore((state) => state.appearance);
  const setAppearance = usePreferencesStore((state) => state.setAppearance);
  const haptics = usePreferencesStore((state) => state.hapticsEnabled);
  const setHaptics = usePreferencesStore((state) => state.setHapticsEnabled);

  const [signingOut, setSigningOut] = useState(false);

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need your password or a one-time code to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          void authService.signOut().finally(() => {
            setSigningOut(false);
            router.replace('/(auth)/sign-in');
          });
        },
      },
    ]);
  };

  const toggleNotification = async (
    key: 'events' | 'bookings' | 'weeklyDigest',
    value: boolean,
  ) => {
    // Turning anything on for the first time is the moment to ask for the OS
    // permission — the member has just said they want these.
    if (value && !notifications.data?.hasPushToken) {
      const granted = await registerPush();
      if (!granted) {
        Alert.alert(
          'Notifications are off',
          'Turn them on for Hacker Dojo in your device settings to get reminders.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open settings', onPress: () => void Linking.openSettings() },
          ],
        );
        return;
      }
    }

    updateNotifications.mutate({ [key]: value });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Profile & settings',
          headerBackTitle: 'Dojo',
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.accentText,
          headerTitleStyle: { color: palette.text, fontSize: 17, fontWeight: '500' },
        }}
      />

      <Screen withTabBar={false} contentInsetAdjustmentBehavior="automatic">
        {isPending ? (
          <ListSkeleton count={3} height={96} />
        ) : me ? (
          <>
            <Card>
              <XStack alignItems="center" gap={space[4]}>
                <Avatar
                  name={me.name}
                  initials={me.initials}
                  imageUrl={me.avatarPath}
                  size={52}
                  seed={me.id}
                />
                <YStack flex={1} gap={space[1]}>
                  <Text variant="title">{me.name}</Text>
                  <Text variant="caption" tone="subtle">
                    {me.email}
                  </Text>
                  <Text variant="caption" tone="subtle">
                    {me.isActiveMember ? (me.membership?.planName ?? 'Member') : 'Guest'}
                  </Text>
                </YStack>
              </XStack>

              {me.skills.length ? (
                <XStack gap={space[2]} flexWrap="wrap" marginTop={space[4]}>
                  {me.skills.map((skill) => (
                    <Chip key={skill} label={skill} readOnly />
                  ))}
                </XStack>
              ) : null}
            </Card>

            {/* ---- Appearance --------------------------------------------- */}
            <Section title="Appearance">
              <Segmented
                accessibilityLabel="App appearance"
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                value={appearance}
                onChange={setAppearance}
              />
              <Text variant="caption" tone="subtle">
                System follows your device setting.
              </Text>
            </Section>

            {/* ---- Notifications ------------------------------------------ */}
            <Section title="Notifications">
              <Card padded="tight">
                {notifications.isPending ? (
                  <ListSkeleton count={3} height={40} />
                ) : (
                  <YStack>
                    <Toggle
                      label="Event announcements"
                      description="New events and reminders for ones you are attending"
                      value={notifications.data?.events ?? false}
                      onChange={(value) => void toggleNotification('events', value)}
                    />
                    <View style={{ height: 1, backgroundColor: palette.border }} />
                    <Toggle
                      label="Booking reminders"
                      description="15 minutes before a reservation starts"
                      value={notifications.data?.bookings ?? false}
                      onChange={(value) => void toggleNotification('bookings', value)}
                    />
                    <View style={{ height: 1, backgroundColor: palette.border }} />
                    <Toggle
                      label="Weekly community digest"
                      description="A Monday summary of what's on"
                      value={notifications.data?.weeklyDigest ?? false}
                      onChange={(value) => void toggleNotification('weeklyDigest', value)}
                    />
                  </YStack>
                )}
              </Card>
            </Section>

            {/* ---- Directory ---------------------------------------------- */}
            <Section title="Directory">
              <Card padded="tight">
                <Toggle
                  label="Show me in the member directory"
                  description="Other members can see your card, skills and current project"
                  value={me.directoryVisible}
                  onChange={(value) => updateProfile.mutate({ directory_visible: value })}
                />
              </Card>
            </Section>

            {/* ---- Feedback ----------------------------------------------- */}
            <Section title="Feedback">
              <Card padded="tight">
                <Toggle
                  label="Haptics"
                  description="Subtle taps on buttons and the door unlock"
                  value={haptics}
                  onChange={setHaptics}
                />
              </Card>
            </Section>

            {/* ---- Account ------------------------------------------------ */}
            <Section title="Account">
              <YStack gap={space[3]}>
                {me.isActiveMember ? (
                  <Button
                    variant="secondary"
                    fullWidth
                    onPress={() =>
                      Linking.openURL('https://billing.stripe.com/p/login/hackerdojo').catch(
                        () => undefined,
                      )
                    }
                  >
                    Manage billing
                  </Button>
                ) : null}

                <Button
                  variant="secondary"
                  fullWidth
                  onPress={() =>
                    Linking.openURL('https://hackerdojo.org/privacy').catch(() => undefined)
                  }
                >
                  Privacy policy
                </Button>

                <Button
                  variant="destructive"
                  fullWidth
                  loading={signingOut}
                  onPress={confirmSignOut}
                >
                  Sign out
                </Button>
              </YStack>
            </Section>

            <YStack marginTop={space[8]} gap={space[1]} alignItems="center">
              <Text variant="caption" tone="subtle" center>
                Hacker Dojo · {dojo.addressLine1}
              </Text>
              <Text variant="caption" tone="subtle" center>
                A 501(c)(3) nonprofit · EIN {dojo.ein}
              </Text>
            </YStack>

            <View style={{ height: insets.bottom + space[8] }} />
          </>
        ) : null}
      </Screen>
    </>
  );
}
