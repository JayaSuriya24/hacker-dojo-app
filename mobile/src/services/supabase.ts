import 'react-native-url-polyfill/auto';
import { AppState, type AppStateStatus } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { appConfig } from '~/constants/config';
import { supabaseSecureStorageAdapter } from './secureStorage';

/**
 * The Supabase client.
 *
 * Sessions persist to the Keychain/Keystore through the SecureStore adapter,
 * so a member stays signed in across launches without their refresh token ever
 * touching unencrypted storage.
 *
 * `detectSessionInUrl` is off: that flag is for browser OAuth redirects. On
 * native the callback arrives as a deep link and is handled explicitly in the
 * auth service, so leaving it on would just add a no-op listener.
 */
export const supabase: SupabaseClient = createClient(
  appConfig.supabaseUrl,
  appConfig.supabaseAnonKey,
  {
    auth: {
      storage: supabaseSecureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: { headers: { 'X-Client-Info': `hackerdojo-mobile/${appConfig.variant}` } },
  },
);

/**
 * Supabase's auto-refresh timer keeps running while the app is backgrounded,
 * where the OS will suspend it anyway — the timer fires late, the token is
 * already stale, and the first query after resume fails. Driving the refresher
 * off the foreground state instead means the token is refreshed when the app is
 * actually able to use it.
 */
let appStateSubscription: { remove: () => void } | null = null;

export function startSessionAutoRefresh(): () => void {
  const handle = (state: AppStateStatus) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  };

  handle(AppState.currentState);
  appStateSubscription = AppState.addEventListener('change', handle);

  return () => {
    appStateSubscription?.remove();
    appStateSubscription = null;
    void supabase.auth.stopAutoRefresh();
  };
}
