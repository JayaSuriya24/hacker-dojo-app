import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuth } from '~/providers/AuthProvider';
import { useUpdateNotificationPreferences } from '~/features/profile/hooks/useProfile';
import { logger } from '~/services/logger';
import { brand } from '~/theme/tokens';
import { isUsableEasProjectId } from '~/constants/easProject';
import { NOTIFICATION_HREF_KEY, notificationHref } from '~/services/notificationRoute';

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

/**
 * expo-notifications ships web builds for only three of its modules — badge,
 * device push token, and server registration. Scheduling, cancelling and
 * Expo push tokens all resolve to the expo-modules-core proxy on web, which
 * throws "The method or property X is not available on web" on the first call.
 *
 * `setNotificationHandler` and the response LISTENER are safe: they are plain
 * JS and are already exercised on every web load by the root layout. The
 * cold-start read is NOT — `getLastNotificationResponseAsync` crosses into the
 * native module and rejects on web, so it is guarded like the rest.
 *
 * Local reminders are a native affordance and the web target exists to lay out
 * screens, so each entry point below degrades to a documented no-op. Throwing
 * would be worse: the caller is a booking confirmation that has already
 * succeeded server-side, and there is nothing useful for it to do with the
 * failure.
 */
const supportsNativeNotifications = Platform.OS !== 'web';

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
        // Android's notification LED / accent for the channel. From the brand
        // ramp rather than a literal, same rule as everything else.
        lightColor: brand[500],
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
    /**
     * Responses already acted on, by notification id.
     *
     * `getLastNotificationResponseAsync` returns the last response the app
     * received, not only the one that launched it — so without this the
     * cold-start read and the live listener would both fire for the same tap
     * and navigate twice.
     */
    const handled = new Set<string>();

    const navigate = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handled.has(id)) return;
      handled.add(id);

      // A notification with no destination is ordinary — a renewal notice has
      // no screen to open — so this is a return, not an error.
      const href = notificationHref(response.notification.request.content.data);
      if (!href) return;

      router.push(href as never);
    };

    /*
     * Cold start. When a tap launches the app from terminated, the response can
     * be delivered before this effect mounts and the listener below never sees
     * it — the tap opens the app on the home screen instead of the event that
     * was tapped. This is the documented way to recover it.
     *
     * Native only. On web this call rejects rather than resolving empty, so an
     * unguarded read logged a `push.coldStart` exception on every page load —
     * noise from a path that can never fire there, since nothing launches the
     * web target from a notification.
     */
    let active = true;
    if (supportsNativeNotifications) {
      void Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (active && response) navigate(response);
        })
        .catch((error: unknown) => {
          logger.exception(error, { scope: 'push.coldStart' });
        });
    }

    // Foreground and background taps, while the app is alive.
    const subscription = Notifications.addNotificationResponseReceivedListener(navigate);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
}

/**
 * Request permission and register the device's push token.
 *
 * Called from a settings row, where the member has just expressed intent —
 * which is both the platform guidance and the difference between a ~70% and a
 * ~30% opt-in rate.
 */
/**
 * Why push registration ended the way it did.
 *
 * This was a bare boolean, and false meant three unrelated things: this device
 * cannot do push at all, the member has blocked it in system settings, or they
 * just declined the prompt. Settings showed one "open your device settings"
 * dialog for all three — advice that is wrong on web, where there is no such
 * pane, and wrong on a simulator, which has no push service to permit.
 */
export type PushRegistration =
  /** A token is stored; this device can receive push. */
  | 'granted'
  /** Web or simulator — no push service exists to register with. */
  | 'unsupported'
  /** Permanently denied. The OS will not prompt again; system settings is the only way back. */
  | 'blocked'
  /** Declined this time, or the token fetch failed. Asking again later is fine. */
  | 'denied';

export function useRegisterPushToken() {
  const { isAuthenticated } = useAuth();
  const { mutateAsync: updatePreferences } = useUpdateNotificationPreferences();

  return useCallback(async (): Promise<PushRegistration> => {
    if (!isAuthenticated) return 'denied';

    // Expo push tokens need a native push service. `Device.isDevice` is true in
    // a browser, so it does not stand in for this check.
    if (!supportsNativeNotifications) {
      logger.info('Skipping push registration on web');
      return 'unsupported';
    }

    // A simulator has no push service to register with.
    if (!Device.isDevice) {
      logger.info('Skipping push registration on a simulator');
      return 'unsupported';
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== 'granted') {
      // `canAskAgain: false` means the member denied permanently; the OS will
      // not show a prompt, so the UI should send them to system settings.
      if (!existing.canAskAgain) return 'blocked';
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') return 'denied';

    /*
     * Expo mints a push token against a specific EAS project, so a missing or
     * placeholder id cannot produce a working one — the request just fails.
     *
     * Checked BEFORE the call rather than caught after it, because the two
     * outcomes need different answers. A rejected permission is the member's
     * decision and 'denied' tells Settings to explain how to change it; a build
     * with no EAS project is our mistake, and telling someone to allow
     * notifications they have already allowed is how this bug stayed invisible.
     *
     * Not a workaround for the failure: `app.config.ts` refuses to BUILD for
     * production or on EAS without a real id, so this branch should be
     * unreachable in a shipped app. It is the seatbelt, and the log is loud
     * because reaching it means the build guard was bypassed.
     */
    const projectId = Constants.expoConfig?.extra?.['eas']?.projectId as string | undefined;

    if (!isUsableEasProjectId(projectId)) {
      logger.error('No usable EAS project id — push cannot be registered for this build', {
        scope: 'push.register',
        // The value, not the member's data: this is a build configuration fault.
        projectId: projectId ?? '(absent)',
      });
      return 'unsupported';
    }

    try {
      const token = await Notifications.getExpoPushTokenAsync({ projectId });

      await updatePreferences({ pushToken: token.data });
      return 'granted';
    } catch (error) {
      logger.exception(error, { scope: 'push.register' });
      return 'denied';
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
  if (!supportsNativeNotifications) return null;

  const fireAt = new Date(input.startsAt.getTime() - (input.minutesBefore ?? 15) * 60_000);
  if (fireAt.getTime() <= Date.now()) return null;

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: `${input.resourceName} in ${input.minutesBefore ?? 15} minutes`,
        body: 'Your reservation starts shortly.',
        // Same canonical key the server uses — see `notificationRoute.ts`.
        data: { [NOTIFICATION_HREF_KEY]: '/book', bookingId: input.bookingId },
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
  if (!supportsNativeNotifications) return;
  await Notifications.cancelScheduledNotificationAsync(identifier);
}
