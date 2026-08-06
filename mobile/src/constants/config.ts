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
  merchantIdentifier: string;
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
  /**
   * The Apple Pay merchant id. Read from config rather than repeated as a
   * literal in the provider and the plugin, which is how those two drift.
   */
  merchantIdentifier: extra.merchantIdentifier ?? 'merchant.org.hackerdojo.app',
  variant: extra.variant ?? 'production',
  isProduction: (extra.variant ?? 'production') === 'production',
} as const;

/**
 * Wall-clock facts about the space, used for copy and the "Open now" pill.
 *
 * `timezone` is the same value `public.dojo_timezone()` returns and the server's
 * `DOJO_TIMEZONE` holds. Opening hours are a property of the building, not of
 * the phone looking at it — a member checking the app from an airport should
 * still read "Open now" against Mountain View's clock.
 */
export const dojo = {
  addressLine1: '855 Maude Ave',
  addressLine2: 'Mountain View, CA 94043',
  ein: '26-4812213',
  timezone: 'America/Los_Angeles',
  publicHours: { opensHour: 10, closesHour: 21 },
  /**
   * Public web pages the app links out to. Here rather than inline in a screen
   * so a domain change is one edit, and so App Review's privacy-policy link can
   * be verified against a single source.
   */
  urls: {
    privacy: 'https://hackerdojo.org/privacy',
    terms: 'https://hackerdojo.org/terms',
    support: 'mailto:stewards@hackerdojo.org',
  },
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
