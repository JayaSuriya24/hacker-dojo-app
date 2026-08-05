import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { authService } from '~/features/auth/services/auth.service';
import { logger } from '~/services/logger';

/**
 * Deep links.
 *
 * Expo Router resolves normal navigation links (`hackerdojo://events/123`,
 * `https://app.hackerdojo.org/events/123`) from the file tree on its own. What
 * it cannot handle is the auth callback, which carries a PKCE code that has to
 * be exchanged for a session before any route decision makes sense — so that
 * one path is intercepted here.
 *
 * Both entry points are covered: `getInitialURL` for a cold start from a link,
 * and the `url` event for a link arriving while the app is already running.
 */
export function useDeepLinks(): void {
  useEffect(() => {
    let active = true;

    const handle = async (url: string | null) => {
      if (!url || !active) return;

      const { path } = Linking.parse(url);
      if (!path?.startsWith('auth/callback') && !path?.startsWith('auth/reset')) return;

      try {
        await authService.completeOAuthRedirect(url);
      } catch (error) {
        // The AuthProvider stays on the signed-out branch and the sign-in
        // screen is already what the member is looking at, so there is nothing
        // to show beyond the log.
        logger.exception(error, { scope: 'deepLink.authCallback' });
      }
    };

    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener('url', (event) => void handle(event.url));

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
}
