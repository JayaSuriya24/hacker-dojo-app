import { type ReactNode, useEffect, useState } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  QueryClient,
  focusManager,
  onlineManager,
  type QueryClientConfig,
} from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { ApiError } from '~/services/api/errors';
import { logger } from '~/services/logger';
import { QUERY_STALE_TIME } from '~/constants/config';

/**
 * Server state, and the offline behaviour that comes with it.
 *
 * Three things are configured here that a default setup gets wrong on mobile:
 *
 * 1. React Query's browser online/focus detection does not exist in React
 *    Native. NetInfo and AppState are wired into `onlineManager` and
 *    `focusManager` so queries pause offline and revalidate on resume.
 * 2. The cache is persisted to AsyncStorage, so a member who opens the app in
 *    the basement lab with no signal still sees last night's events list rather
 *    than an empty screen.
 * 3. Retries are selective. Retrying a 403 three times just delays the error
 *    the member needs to see.
 */

const queryConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME.standard,
      // Long enough that yesterday's cache is still a useful offline read.
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          // Auth, permission and validation failures are terminal — the same
          // request will fail identically.
          if (!error.retryable) return false;
          if (error.isAuthFailure || error.isMembershipGate) return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      // The pull-to-refresh gesture is the explicit path; automatic refetch on
      // every mount would fight it and double-fetch on tab switches.
      refetchOnMount: 'always',
    },
    mutations: {
      retry: false,
      onError: (error) => {
        logger.exception(error, { scope: 'mutation' });
      },
    },
  },
};

/**
 * The query scopes allowed onto disk.
 *
 * AsyncStorage is not encrypted, so this is an allowlist and the default is
 * NO. A scope added to `queryKeys.ts` later is private until someone decides
 * otherwise, rather than public until someone remembers — which is how the
 * Wi-Fi PIN ended up here.
 *
 * What is on the list is what the offline story actually needs: the events
 * list and the space's own facts, readable in the basement lab with no signal.
 * None of it is about a particular member.
 */
const PERSISTED_SCOPES: ReadonlySet<string> = new Set(['dojo', 'events', 'resources']);

/**
 * Personal sub-keys inside an otherwise persistable scope.
 *
 * `['resources','schedule']` carries who has the room — a real member name for
 * anyone who has not turned directory visibility off.
 */
const BLOCKED_SUBKEYS: ReadonlySet<string> = new Set(['resources:schedule']);

/**
 * Impersonal sub-keys inside an otherwise private scope.
 *
 * The startup directory is public content that happens to live under
 * `community`, next to the member directory that must never be written down.
 */
const PERSISTED_SUBKEYS: ReadonlySet<string> = new Set(['community:startups', 'community:startup']);

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'hackerdojo.query-cache',
  throttleTime: 2000,
});

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient(queryConfig));

  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      // `isInternetReachable` is null while NetInfo is still probing; treat
      // that as online so the first render is not stuck in an offline state.
      onlineManager.setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });

    const handleAppState = (status: AppStateStatus) => {
      if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);

    return () => {
      unsubscribeNet();
      appStateSub.remove();
    };
  }, []);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Never persist a failed query — a stale error would be restored
            // and shown before the refetch had a chance to succeed.
            if (query.state.status !== 'success') return false;

            const [scope, sub] = query.queryKey as [string, string?];
            if (typeof scope !== 'string') return false;

            const subKey = sub === undefined ? null : `${scope}:${sub}`;

            if (subKey !== null && BLOCKED_SUBKEYS.has(subKey)) return false;
            if (PERSISTED_SCOPES.has(scope)) return true;
            if (subKey !== null && PERSISTED_SUBKEYS.has(subKey)) return true;

            // Everything else — me, access, uploads, staff, and the member
            // directory — stays in memory only.
            return false;
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
