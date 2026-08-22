/**
 * The push notification payload contract.
 *
 * This file exists because the server and the app disagreed about one field
 * name and nothing could tell them apart: every producer here sent
 * `data: { route }`, the app read `data.href`, and the mismatch was invisible
 * at both ends. The notification arrived, the banner rendered, the member
 * tapped it — and nothing happened, silently, with no error anywhere.
 *
 * `href` is the canonical name, and it was chosen from the code rather than by
 * preference:
 *
 *   · The APP is the only thing that reads it, and it reads `href`.
 *   · `scheduleBookingReminder` in the app already SENDS `href`, and locally
 *     scheduled reminders are the one notification path that works end to end
 *     today. Renaming to anything else would break the working half to fix the
 *     broken half.
 *   · expo-router — the navigation system the value is handed to — calls a
 *     navigation target `href` everywhere (`<Link href>`, `router.push`).
 *
 * The counterpart is `mobile/src/services/notificationRoute.ts`. These two
 * files are the whole contract; keep them in step.
 */

/**
 * An in-app destination.
 *
 * Typed as a leading-slash template so a producer cannot pass an absolute URL
 * such as `https://…` without the compiler objecting. The app validates it
 * again on arrival — a type is not a security boundary, and the payload has
 * crossed the network by then.
 */
export type NotificationHref = `/${string}`;

/**
 * What rides along with a push so the app knows where a tap should go.
 *
 * Deliberately a closed shape rather than `Record<string, string>`. That is
 * what makes `data: { route: … }` a compile error instead of a silently
 * ignored field, which is exactly how this bug survived.
 */
export interface NotificationData {
  /** CANONICAL routing field. The app navigates here on tap. */
  href: NotificationHref;
}

/** Build the routing payload. One call site per producer, no bare literals. */
export function routeTo(href: NotificationHref): NotificationData {
  return { href };
}

/**
 * The destinations the server sends members to.
 *
 * Named rather than written inline at four call sites, so a route rename is one
 * edit and a typo is a compile error. The `(app)` / `(tabs)` groups are
 * expo-router's own segment syntax and are part of the route id.
 */
export const NOTIFICATION_ROUTES = {
  bookings: '/(app)/(tabs)/book',
  events: '/(app)/(tabs)/events',
  settings: '/(app)/settings',
  event: (eventId: string): NotificationHref => `/(app)/event/${eventId}`,
} as const satisfies Record<string, NotificationHref | ((id: string) => NotificationHref)>;
