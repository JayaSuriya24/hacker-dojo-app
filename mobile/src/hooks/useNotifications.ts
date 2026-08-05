import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuth } from '~/providers/AuthProvider';
import { useUpdateNotificationPreferences } from '~/features/profile/hooks/useProfile';
import { logger } from '~/services/logger';

/**
 * Push and local notifications.
 *
 * Two platform rules shape this:
 *
 * - Android requires notification CHANNELS. Without them, notifications are
 *   silently dropped on API 26+. Each channel is separately controllable in
 *   system settings, which is what Google's guidelines expect — a member can
 *   mute the weekly digest without losing booking reminders.
 * - iOS and Android 13+ both require a runtime permission prompt. It is NOT
 *   requested at launch: asking before the member has seen why is the reliable
 *   way to get a permanent denial. `requestPermission` is called from the
 *   notification settings row instead.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CHANNELS = [
  {
    id: 'default',
    name: 'General',
    description: 'Announcements from the Dojo',
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  {
    id: 'bookings',
    name: 'Booking reminders',
    description: 'Reminders before a machine or room reservation starts',
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    id: 'events',
    name: 'Events',
    description: 'New events and reminders for events you are attending',
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  {
    id: 'digest',
    name: 'Weekly digest',
    description: "A Monday summary of what's on",
    importance: Notifications.AndroidImportance.LOW,
  },
] as const;

async function registerChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Promise.all(
    CHANNELS.map((channel) =>
      Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        description: channel.description,
        importance: channel.importance,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E33230',
      }),
    ),
  );
}

/**
 * Channel registration and tap routing. Mounted once, in the root layout.
 * Deliberately does not request permission — see the note above.
 */
export function useNotificationSetup(): void {
  useEffect(() => {
    void registerChannels();
  }, []);

  useEffect(() => {
    // A notification tapped from the tray carries the destination in its data
    // payload, so the server decides where a given notification lands rather
    // than the client having to know every notification type.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const target = response.notification.request.content.data?.['href'];
      if (typeof target === 'string' && target.startsWith('/')) {
        router.push(target as never);
      }
    });

    return () => subscription.remove();
  }, []);
}

/**
 * Request permission and register the device's push token.
 *
 * Called from a settings row, where the member has just expressed intent —
 * which is both the platform guidance and the difference between a ~70% and a
 * ~30% opt-in rate.
 */
export function useRegisterPushToken() {
  const { isAuthenticated } = useAuth();
  const { mutateAsync: updatePreferences } = useUpdateNotificationPreferences();

  return useCallback(async (): Promise<boolean> => {
    if (!isAuthenticated) return false;

    // A simulator has no push service to register with.
    if (!Device.isDevice) {
      logger.info('Skipping push registration on a simulator');
      return false;
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== 'granted') {
      // `canAskAgain: false` means the member denied permanently; the OS will
      // not show a prompt, so the UI should send them to system settings.
      if (!existing.canAskAgain) return false;
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') return false;

    try {
      const projectId = Constants.expoConfig?.extra?.['eas']?.projectId as string | undefined;
      const token = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );

      await updatePreferences({ pushToken: token.data });
      return true;
    } catch (error) {
      logger.exception(error, { scope: 'push.register' });
      return false;
    }
  }, [isAuthenticated, updatePreferences]);
}

/** Local reminder ahead of a reservation — works with no network. */
export async function scheduleBookingReminder(input: {
  bookingId: string;
  resourceName: string;
  startsAt: Date;
  minutesBefore?: number;
}): Promise<string | null> {
  const fireAt = new Date(input.startsAt.getTime() - (input.minutesBefore ?? 15) * 60_000);
  if (fireAt.getTime() <= Date.now()) return null;

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: `${input.resourceName} in ${input.minutesBefore ?? 15} minutes`,
        body: 'Your reservation starts shortly.',
        data: { href: '/book', bookingId: input.bookingId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: 'bookings',
      },
    });
  } catch (error) {
    logger.exception(error, { scope: 'push.scheduleReminder' });
    return null;
  }
}

export async function cancelScheduled(identifier: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}
