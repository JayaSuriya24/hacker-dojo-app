import Constants from 'expo-constants';

/**
 * Runtime configuration, read once from `app.config.ts` → `extra`.
 *
 * Everything here is public: it is compiled into the bundle and can be read out
 * of any installed app. The Supabase anon key is safe because RLS is the actual
 * protection; the Stripe publishable key is safe by design. No secret ever
 * reaches this file.
 */

interface ExtraConfig {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  stripePublishableKey: string;
  variant: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<ExtraConfig>;

function required(key: keyof ExtraConfig, value: string | undefined): string {
  if (!value) {
    // Failing at startup beats a blank screen on the first query. In a release
    // build a missing key means the build pipeline is misconfigured, and that
    // should be loud.
    throw new Error(
      `Missing app config value "${key}". Set EXPO_PUBLIC_${key
        .replace(/([A-Z])/g, '_$1')
        .toUpperCase()} for this build profile.`,
    );
  }
  return value;
}

export const appConfig = {
  apiBaseUrl: required('apiBaseUrl', extra.apiBaseUrl),
  supabaseUrl: required('supabaseUrl', extra.supabaseUrl),
  supabaseAnonKey: required('supabaseAnonKey', extra.supabaseAnonKey),
  stripePublishableKey: extra.stripePublishableKey ?? '',
  variant: extra.variant ?? 'production',
  isProduction: (extra.variant ?? 'production') === 'production',
} as const;

/** Wall-clock facts about the space, used for copy and the "Open now" pill. */
export const dojo = {
  addressLine1: '855 Maude Ave',
  addressLine2: 'Mountain View, CA 94043',
  ein: '26-4812213',
  publicHours: { opensHour: 10, closesHour: 21 },
  transit: '5 min walk from Middlefield VTA\n1 min to Bus 21 · Free lot on site',
} as const;

export const QUERY_STALE_TIME = {
  /** Occupancy moves constantly; anything older than a minute is misleading. */
  realtime: 30_000,
  /** Events, bookings — changes when someone acts, so revalidate on focus. */
  standard: 2 * 60_000,
  /** Plans, programs, FAQ — editorial content that changes weekly at most. */
  static: 30 * 60_000,
} as const;
