import { useCallback, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
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
  Divider,
  Segmented,
  StatusPill,
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
import { useAvatarUpload, useDeleteAvatar } from '~/features/uploads/hooks/useUploads';
import { useBillingPortal } from '~/features/payments/hooks/usePayments';
import { useIsStaff } from '~/features/staff/hooks/useStaff';
import { useDoorHistory } from '~/features/access/hooks/useAccess';
import { userMessage } from '~/services/api/errors';
import { confirm } from '~/services/confirm';
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
  const [photoError, setPhotoError] = useState<string | null>(null);

  const avatar = useAvatarUpload();
  const removeAvatar = useDeleteAvatar();
  const billingPortal = useBillingPortal();
  const isStaff = useIsStaff();
  const doorHistory = useDoorHistory();

  const changePhoto = useCallback(async () => {
    setPhotoError(null);
    try {
      await avatar.pickAndUpload();
    } catch (error) {
      setPhotoError(userMessage(error));
    }
  }, [avatar]);

  const confirmSignOut = async () => {
    const confirmed = await confirm({
      title: 'Sign out?',
      message: 'You will need your password or a one-time code to sign back in.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!confirmed) return;

    setSigningOut(true);
    // Route away regardless: a failed token revocation still clears the local
    // session, and leaving someone stranded on a signed-in screen they asked to
    // leave is worse than a server-side session that expires on its own.
    void authService.signOut().finally(() => {
      setSigningOut(false);
      router.replace('/(auth)/sign-in');
    });
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
        const openSettings = await confirm({
          title: 'Notifications are off',
          message: 'Turn them on for Hacker Dojo in your device settings to get reminders.',
          confirmLabel: 'Open settings',
          cancelLabel: 'Not now',
        });
        // `Linking.openSettings` does not exist on react-native-web — calling it
        // there is a TypeError, not a no-op. A browser has no app settings pane
        // to open anyway; the confirm above is the whole message on web.
        if (openSettings && Platform.OS !== 'web') void Linking.openSettings();
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
                  imageUrl={me.avatarUrl}
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

              {photoError ? (
                <View aria-live="assertive" role="alert">
                  <Text variant="caption" tone="error">
                    {photoError}
                  </Text>
                </View>
              ) : null}

              <XStack gap={space[3]} marginTop={space[3]}>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={avatar.isPending}
                  disabled={avatar.isPending || removeAvatar.isPending}
                  onPress={() => void changePhoto()}
                  aria-label="Change your profile photo"
                >
                  {me.avatarUrl ? 'Change photo' : 'Add a photo'}
                </Button>
                {me.avatarUrl ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={removeAvatar.isPending}
                    disabled={avatar.isPending || removeAvatar.isPending}
                    onPress={() => removeAvatar.mutate()}
                    aria-label="Remove your profile photo"
                  >
                    Remove
                  </Button>
                ) : null}
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
                aria-label="App appearance"
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
                    <Divider variant="inset" spacing={0} />
                    <Toggle
                      label="Booking reminders"
                      description="15 minutes before a reservation starts"
                      value={notifications.data?.bookings ?? false}
                      onChange={(value) => void toggleNotification('bookings', value)}
                    />
                    <Divider variant="inset" spacing={0} />
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

            {/* ---- Door activity ------------------------------------------ */}
            {me.isActiveMember ? (
              <Section title="Door activity">
                <Card padded="tight" gap={space[2]}>
                  {doorHistory.isPending ? (
                    <ListSkeleton count={2} height={28} />
                  ) : (doorHistory.data ?? []).length === 0 ? (
                    <Text variant="small" tone="subtle">
                      No door events yet.
                    </Text>
                  ) : (
                    /*
                     * The member's own audit trail. Every unlock attempt writes a
                     * row, granted or refused, and showing them the refusals is
                     * the point: "why wouldn't the door open at 11pm" is
                     * answerable now rather than a shrug at the front desk.
                     */
                    (doorHistory.data ?? []).slice(0, 5).map((entry, index) => (
                      <YStack key={entry.id}>
                        {index > 0 ? <Divider variant="inset" spacing={space[2]} /> : null}
                        <XStack alignItems="center" gap={space[3]} paddingVertical={space[1]}>
                          <StatusPill
                            label={entry.granted ? 'Opened' : 'Refused'}
                            tone={entry.granted ? 'ok' : 'error'}
                            bordered={false}
                          />
                          <Text variant="caption" tone="subtle" flex={1} numberOfLines={1}>
                            {entry.reason ? entry.reason.replace(/_/g, ' ') : ''}
                          </Text>
                          <Text variant="mono" tone="subtle">
                            {new Date(entry.at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </Text>
                        </XStack>
                      </YStack>
                    ))
                  )}
                </Card>
              </Section>
            ) : null}

            {/* ---- Verification ------------------------------------------- */}
            <Section title="Verification">
              <Card padded="tight" gap={space[2]}>
                <Text variant="small" tone="muted">
                  The Student and Veteran rates need one document on file.
                </Text>
                <YStack alignSelf="flex-start" marginTop={space[2]}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push('/(app)/verification')}
                  >
                    Upload a document
                  </Button>
                </YStack>
              </Card>
            </Section>

            {/* ---- Staff --------------------------------------------------- */}
            {isStaff ? (
              <Section title="Staff">
                <Button
                  variant="secondary"
                  fullWidth
                  onPress={() => router.push('/(app)/staff')}
                  accessibilityHint="Opens the front desk queue"
                >
                  Front desk queue
                </Button>
              </Section>
            ) : null}

            {/* ---- Account ------------------------------------------------ */}
            <Section title="Account">
              <YStack gap={space[3]}>
                {/*
                  Stripe's own Billing Portal. The previous link was a literal
                  `billing.stripe.com/p/login/hackerdojo`, which is not a real
                  portal URL — a member tapping this reached a Stripe 404. The
                  session is minted per tap because portal links are single-use.
                */}
                {me.membership?.manageable ? (
                  <Button
                    variant="secondary"
                    fullWidth
                    loading={billingPortal.isPending}
                    onPress={() => billingPortal.mutate()}
                    accessibilityHint="Opens Stripe to change your plan, card or cancel"
                  >
                    Manage billing
                  </Button>
                ) : null}

                <Button
                  variant="secondary"
                  fullWidth
                  onPress={() => Linking.openURL(dojo.urls.privacy).catch(() => undefined)}
                >
                  Privacy policy
                </Button>

                <Button
                  variant="destructive"
                  fullWidth
                  loading={signingOut}
                  onPress={() => void confirmSignOut()}
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
