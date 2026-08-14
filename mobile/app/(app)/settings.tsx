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
    /*
     * Save the preference first, and unconditionally.
     *
     * This used to sit behind the permission check and `return` when push
     * registration failed, which meant the switch could not be turned on at all
     * on web or on a simulator: `registerPush` answers 'unsupported' there, and
     * the preference was thrown away before it reached the API. The switch
     * snapped back and nothing was written.
     *
     * The two are not the same decision. The preference lives on the profile
     * and applies to every device the member signs in on; a push token is one
     * device's ability to receive what the preference asks for. Someone setting
     * this from a browser is expressing a choice about their phone, and the
     * server is entitled to hear it either way.
     */
    updateNotifications.mutate({ [key]: value });

    // Turning something on is the moment to ask for the OS permission — the
    // member has just said they want these. Nothing below can un-save the line
    // above; it only decides what we tell them about delivery.
    if (!value || notifications.data?.hasPushToken) return;

    const outcome = await registerPush();
    if (outcome === 'granted') return;

    if (outcome === 'unsupported') {
      // No permission to grant and no settings pane to open — a browser or a
      // simulator simply has no push service. Saying "turn them on in your
      // device settings" here sends someone looking for a switch that is not
      // there, which is what the single boolean used to do.
      await confirm({
        title: 'Saved for your phone',
        message:
          'This preference is saved, but push notifications only arrive on the Hacker Dojo app on a real device.',
        confirmLabel: 'Got it',
      });
      return;
    }

    const openSettings = await confirm({
      title: 'Notifications are off',
      message:
        outcome === 'blocked'
          ? 'Your preference is saved. To actually get them, turn notifications on for Hacker Dojo in your device settings.'
          : 'Your preference is saved. Allow notifications when asked to start receiving them.',
      confirmLabel: outcome === 'blocked' ? 'Open settings' : 'Got it',
      cancelLabel: 'Not now',
    });

    // `Linking.openSettings` does not exist on react-native-web — calling it
    // there is a TypeError, not a no-op. Unreachable from the 'unsupported'
    // branch above, but the platform guard stays as a belt on the braces.
    if (openSettings && outcome === 'blocked' && Platform.OS !== 'web') {
      void Linking.openSettings();
    }
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
                      description="New event announcements by email."
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

                {/*
                  The mutation rolls a failed write back optimistically, which
                  moved the switch back to where it started and said nothing at
                  all — indistinguishable from the member's own tap not
                  registering. Same treatment as Manage billing on the Dojo tab.
                */}
                {updateNotifications.isError ? (
                  <Text variant="small" tone="error" aria-live="polite">
                    {userMessage(updateNotifications.error)}
                  </Text>
                ) : null}
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
                {updateProfile.isError ? (
                  <Text variant="small" tone="error" aria-live="polite">
                    {userMessage(updateProfile.error)}
                  </Text>
                ) : null}
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
                  <>
                    <Button
                      variant="secondary"
                      fullWidth
                      loading={billingPortal.isPending}
                      onPress={() => billingPortal.mutate()}
                      accessibilityHint="Opens Stripe to change your plan, card or cancel"
                    >
                      Manage billing
                    </Button>

                    {/* Same silent failure as the Dojo tab's copy of this
                        button: without this the tap simply did nothing. */}
                    {billingPortal.isError ? (
                      <Text variant="small" tone="error" aria-live="polite">
                        {userMessage(billingPortal.error)}
                      </Text>
                    ) : null}
                  </>
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
