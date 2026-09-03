import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, startSessionAutoRefresh } from '~/services/supabase';
import { logger } from '~/services/logger';

/**
 * Session state for the whole app.
 *
 * This provider owns exactly one question — is there a session, and is it still
 * loading — because that answer gates routing. The member's *profile* is server
 * state and lives in React Query (`useMe`); keeping the two separate means a
 * profile edit does not churn the auth context and re-render the navigator.
 */

interface AuthContextValue {
  session: Session | null;
  userId: string | null;
  /** True until the persisted session has been read from the Keychain. */
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  /**
   * Who the cache currently belongs to.
   *
   * A ref rather than state: it is read and written inside the auth callback
   * and must not re-run the effect that registered it. `null` means the cache
   * holds nothing personal — a fresh launch, or just after a sign-out.
   */
  const cachedUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    // The persisted session is read from secure storage asynchronously. Until
    // it resolves the app shows the splash — routing before it lands would
    // flash the sign-in screen at an already-signed-in member.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch((error: unknown) => {
        logger.exception(error, { scope: 'auth.getSession' });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;

      setSession(nextSession);

      // On sign-out, drop every cached query. Without this the next person to
      // sign in on the same device briefly sees the previous member's
      // directory and bookings from cache.
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
      }

      /*
       * A different user signing in must not inherit the previous one's cache
       * either — but `invalidateQueries` alone does not achieve that. It marks
       * queries stale and refetches them, and React Query keeps SERVING the
       * cached data until each refetch lands, so the incoming member renders
       * the outgoing member's bookings and directory for as long as the
       * network takes.
       *
       * So: clear outright when the identity actually changed, and invalidate
       * only when it did not. A token refresh or an app resume re-fires
       * SIGNED_IN for the same person, and throwing away a good cache there
       * would cost a full refetch on every resume for no safety gain.
       */
      if (event === 'SIGNED_IN') {
        const nextUserId = nextSession?.user.id ?? null;

        if (cachedUserId.current !== null && cachedUserId.current !== nextUserId) {
          queryClient.clear();
        } else {
          void queryClient.invalidateQueries();
        }
      }

      cachedUserId.current = nextSession?.user.id ?? null;

      logger.debug('Auth state changed', { event });
    });

    const stopRefresh = startSessionAutoRefresh();

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
      stopRefresh();
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      isLoading,
      isAuthenticated: session !== null,
    }),
    [session, isLoading],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
