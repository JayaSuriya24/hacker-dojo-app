/**
 * Where a tapped notification goes.
 *
 * The counterpart of `server/src/types/notifications.ts`. Those two files are
 * the entire routing contract, and they exist because the two ends drifted:
 * the server sent `data: { route }` while this app read `data.href`, so a
 * notification could be delivered, rendered and tapped with nothing happening
 * at all — no navigation, no error, nothing to notice.
 *
 * `href` is canonical. It is what this app has always read, what
 * `scheduleBookingReminder` already sends, and what expo-router calls a
 * navigation target.
 *
 * Every read of the payload goes through `notificationHref` below. Nothing else
 * in the app should index into notification data by string — that is how three
 * spellings of the same idea got loose in the first place.
 */

/** The one key. Exported so tests and producers cannot misspell it. */
export const NOTIFICATION_HREF_KEY = 'href';

/**
 * Extract a safe in-app destination from a notification's data payload.
 *
 * Returns `null` for anything it will not navigate to, which the caller treats
 * as "just open the app" — a notification with no destination is ordinary (a
 * membership renewal notice needs no screen), not an error.
 *
 * The validation is a security boundary, not tidiness. This value arrives over
 * the network inside a push payload; anyone who can send this device a push can
 * choose it. `router.push` is happy to be handed something that is not a route,
 * so the rules are:
 *
 *   · must be an absolute in-app path (`/…`) — rejects `https://evil.example`
 *     and any custom scheme outright;
 *   · must not begin `//` — on the web target that is a PROTOCOL-RELATIVE URL,
 *     so `//evil.example` would navigate off-origin. This is the open redirect,
 *     and a naive `startsWith('/')` check lets it straight through;
 *   · must contain no scheme separator or backslash anywhere, which closes the
 *     `/\/evil.example` and `/https://…` shapes that some routers normalise.
 *
 * Deliberately NOT an allowlist of known routes: destinations include dynamic
 * segments (`/(app)/event/<uuid>`) and expo-router group syntax, so a list
 * would be wrong the first time a route was added — and it would fail closed on
 * a legitimate notification, which is its own kind of silent breakage. The
 * structural rules above are what actually prevent leaving the app.
 */
export function notificationHref(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;

  const raw = (data as Record<string, unknown>)[NOTIFICATION_HREF_KEY];
  if (typeof raw !== 'string') return null;

  const href = raw.trim();

  if (!href.startsWith('/')) return null;
  if (href.startsWith('//')) return null;
  if (href.includes('\\')) return null;
  if (href.includes('://')) return null;
  // `/https:/…` and friends: a scheme immediately after the leading slashes.
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(href)) return null;

  return href;
}
