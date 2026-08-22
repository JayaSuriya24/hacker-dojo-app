import type { ExpoConfig } from 'expo/config';

/**
 * Expo app configuration.
 *
 * A `.ts` config rather than `app.json` so per-channel values (API base URL,
 * Stripe publishable key, bundle id suffix) can be read from the EAS build
 * profile's environment instead of being duplicated across three static files.
 */

const VARIANT = process.env['APP_VARIANT'] ?? 'production';

/**
 * The Apple Pay merchant id, created in the Apple Developer portal.
 *
 * Declared once and referenced by the entitlement, the Stripe plugin and
 * `extra` — the three previously repeated the same literal, and a mismatch
 * between them fails at the payment sheet rather than at build time.
 */
const MERCHANT_IDENTIFIER = 'merchant.org.hackerdojo.app';
/**
 * The EAS project, resolved once and shared by `extra.eas` and `updates.url`.
 *
 * Both used to read `EAS_PROJECT_ID` separately, each with its own
 * `?? '00000000-…'` fallback — two copies of the same placeholder that could
 * drift and that made a missing id look configured. `undefined` here means
 * "no EAS project", and both consumers below are omitted rather than pointed at
 * a project that does not exist. For a production or EAS build this throws
 * instead; see `resolveEasProjectId`.
 */
const PLACEHOLDER_EAS_PROJECT_ID = '00000000-0000-0000-0000-000000000000';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * Inlined rather than imported. Expo transpiles ONLY this file when it reads
 * the config, so a relative import of another `.ts` module fails with
 * "Cannot find module" — verified, not assumed. `src/constants/easProject.ts`
 * carries the same rule for the RUNTIME half (see `useRegisterPushToken`).
 */
function resolveEasProjectId(): string | undefined {
  const raw = process.env['EAS_PROJECT_ID']?.trim();
  const usable =
    raw && raw !== PLACEHOLDER_EAS_PROJECT_ID && UUID_PATTERN.test(raw) ? raw : undefined;

  if (usable) return usable;

  // Required for anything that will talk to EAS: the store build always, and
  // any EAS build at all — an EAS project is one project across variants, so a
  // preview build cannot resolve one either. Local `expo start` is exempt.
  if (VARIANT === 'production' || process.env['EAS_BUILD'] === 'true') {
    throw new Error(
      [
        `EAS_PROJECT_ID is ${raw ? `not usable ("${raw}")` : 'not set'}, and this build needs it.`,
        '',
        'Push notifications and OTA updates both key off it: without a real id,',
        'getExpoPushTokenAsync fails and updates.url points at a project that does',
        'not exist — silently, in a shipped app.',
        '',
        'Set it to the id from `eas project:info` (or the Expo dashboard) as an EAS',
        'environment variable named EAS_PROJECT_ID, so every build profile gets it.',
        'It is configuration, not a secret.',
      ].join('\n'),
    );
  }

  return undefined;
}

const EAS_PROJECT_ID = resolveEasProjectId();

const IS_DEV = VARIANT === 'development';
const IS_PREVIEW = VARIANT === 'preview';

function suffixed(base: string): string {
  if (IS_DEV) return `${base}.dev`;
  if (IS_PREVIEW) return `${base}.preview`;
  return base;
}

function displayName(): string {
  if (IS_DEV) return 'Dojo (Dev)';
  if (IS_PREVIEW) return 'Dojo (Preview)';
  return 'Hacker Dojo';
}

const config: ExpoConfig = {
  name: displayName(),
  slug: 'hackerdojo',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  scheme: 'hackerdojo',
  // `automatic` is what makes the OS appearance setting reach the app; pinning
  // 'light' here would make the dark palette unreachable.
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],

  // The splash screen is configured through the `expo-splash-screen` plugin
  // below rather than a top-level `splash` key — that key was removed in SDK 57.

  ios: {
    bundleIdentifier: suffixed('org.hackerdojo.app'),
    buildNumber: '1',
    supportsTablet: true,
    // Turn off only for the flows the app actually uses; iPad multitasking
    // stays on because the Dojo tab has a real two-column layout.
    requireFullScreen: false,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      CFBundleDisplayName: displayName(),
      // NFC/proximity door unlock and the QR check-in are the only two device
      // capabilities the app asks for. Each string says what it is FOR, which
      // is what App Review checks.
      NSCameraUsageDescription:
        'Scan a check-in QR code at an event, or take a photo for your member profile.',
      NSPhotoLibraryUsageDescription: 'Choose a photo for your member profile.',
      NSFaceIDUsageDescription: 'Unlock the front door with Face ID instead of your passcode.',
      NSLocationWhenInUseUsageDescription:
        'Show how busy the Dojo is and confirm you are on site when you badge in.',
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['remote-notification'],
    },
    associatedDomains: ['applinks:app.hackerdojo.org'],
    entitlements: {
      'com.apple.developer.applesignin': ['Default'],
      // Apple Pay. The merchant id is created in the Apple Developer portal.
      'com.apple.developer.in-app-payments': [MERCHANT_IDENTIFIER],
    },
  },

  android: {
    package: suffixed('org.hackerdojo.app'),
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#E33230',
    },
    // Edge-to-edge is always on from SDK 54 — the design already draws under
    // the status bar, which is why every screen insets its own content rather
    // than relying on a SafeAreaView wrapper.
    predictiveBackGestureEnabled: true,
    permissions: [
      'android.permission.CAMERA',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.VIBRATE',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'app.hackerdojo.org', pathPrefix: '/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },

  web: { bundler: 'metro', output: 'static', favicon: './assets/favicon.png' },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-apple-authentication',
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: { backgroundColor: '#161826' },
      },
    ],
    [
      'expo-notifications',
      { icon: './assets/notification-icon.png', color: '#E33230', defaultChannel: 'default' },
    ],
    ['expo-image-picker', { photosPermission: 'Choose a photo for your member profile.' }],
    /*
     * Calendar. The strings are what iOS and Android show in the permission
     * dialog, so they say what the app will do with the access rather than
     * asking for it in the abstract — "Hacker Dojo would like to access your
     * calendar" with no reason is the prompt people decline.
     *
     * Write-only is not requested separately: the flow reads the device's
     * default calendar to know where to put the event, which needs read access
     * on both platforms.
     */
    [
      'expo-calendar',
      {
        calendarPermission: 'Add events you RSVP to straight into your calendar.',
      },
    ],
    [
      '@stripe/stripe-react-native',
      {
        merchantIdentifier: MERCHANT_IDENTIFIER,
        enableGooglePay: true,
      },
    ],
  ],

  experiments: { typedRoutes: true, reactCompiler: true },

  /**
   * Values readable from the client at runtime.
   *
   * Everything here ships inside the bundle and must be treated as public. The
   * Stripe PUBLISHABLE key belongs here; the secret key never does. Likewise
   * the Supabase ANON key, which is safe precisely because RLS is what protects
   * the data — the service-role key stays on the server.
   */
  extra: {
    apiBaseUrl:
      process.env['EXPO_PUBLIC_API_BASE_URL'] ??
      (IS_DEV ? 'http://localhost:4000/v1' : 'https://api.hackerdojo.org/v1'),
    supabaseUrl: process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? '',
    supabaseAnonKey: process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
    stripePublishableKey: process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY'] ?? '',
    /**
     * Whether Sign in with Apple is live on the Supabase project.
     *
     * A build-time switch, not a secret — it says only whether the provider is
     * configured server side, and the Apple client secret never comes near this
     * bundle. It exists because the button and the provider have to be turned on
     * in the same change: a rendered Apple button backed by an unconfigured
     * provider fails with `invalid_client` AFTER the member has committed to
     * that sign-in route, which is worse than not offering it.
     *
     * Set `EXPO_PUBLIC_APPLE_AUTH_ENABLED=true` for a build only once
     * `[auth.external.apple]` is enabled and credentialed in Supabase.
     */
    appleAuthEnabled: process.env['EXPO_PUBLIC_APPLE_AUTH_ENABLED'] === 'true',
    merchantIdentifier: MERCHANT_IDENTIFIER,
    variant: VARIANT,
    // Omitted when unset, so `useRegisterPushToken` sees `undefined` and skips
    // rather than asking Expo for a token against a non-existent project.
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },

  /*
   * OTA. Declared only when there is a project to point at — an `updates.url`
   * naming a non-existent project is worse than no updates block, because the
   * client keeps trying and failing against it.
   *
   * `runtimeVersion` stays either way: it is what pairs a JS update with a
   * compatible native binary, and it is harmless without `updates`.
   */
  ...(EAS_PROJECT_ID
    ? { updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}`, fallbackToCacheTimeout: 3000 } }
    : {}),
  runtimeVersion: { policy: 'appVersion' },

  owner: 'hackerdojo',
};

export default config;
