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

            // The member directory and profile are personal data. Keeping them
            // in an unencrypted store past the session is not worth the
            // marginal offline benefit.
            const [scope, sub] = query.queryKey as [string, string?];
            if (scope === 'community' && sub === 'directory') return false;
            if (scope === 'me') return false;

            return true;
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
