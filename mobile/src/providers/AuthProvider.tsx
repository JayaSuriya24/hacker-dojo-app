import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
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

      // A different user signing in must not inherit the previous one's cache
      // either — same reasoning, different trigger.
      if (event === 'SIGNED_IN') {
        void queryClient.invalidateQueries();
      }

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
