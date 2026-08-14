import { router } from 'expo-router';

/**
 * Leaving a screen without assuming something is behind it.
 *
 * `router.back()` is a no-op when the history is empty, and in development it
 * warns: "The action 'GO_BACK' was not handled by any navigator." That happens
 * far more often than it looks — a deep link, a notification tap, a web reload
 * on a sheet URL, or the first screen after a redirect all leave a stack with
 * exactly one entry. The member then presses Done and nothing moves.
 *
 * So every exit states where it goes when there is no back: `back()` when the
 * stack can serve it, an explicit destination when it cannot.
 */

type Destination = Parameters<typeof router.replace>[0];

/** Where an authenticated screen lands when there is nothing behind it. */
export const APP_HOME: Destination = '/(app)/(tabs)';

/** Where an auth screen lands. Sending a signed-out visitor to the tabs would
 *  bounce off the group's guard and back to sign-in anyway — via a flash of a
 *  screen they are not allowed to see. */
export const AUTH_HOME: Destination = '/(auth)/sign-in';

export function goBackOr(fallback: Destination = APP_HOME): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
