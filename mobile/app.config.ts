import type { ExpoConfig } from 'expo/config';

/**
 * Expo app configuration.
 *
 * A `.ts` config rather than `app.json` so per-channel values (API base URL,
 * Stripe publishable key, bundle id suffix) can be read from the EAS build
 * profile's environment instead of being duplicated across three static files.
 */

const VARIANT = process.env['APP_VARIANT'] ?? 'production';
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
      'com.apple.developer.in-app-payments': ['merchant.org.hackerdojo.app'],
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
    [
      '@stripe/stripe-react-native',
      {
        merchantIdentifier: 'merchant.org.hackerdojo.app',
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
    variant: VARIANT,
    eas: { projectId: process.env['EAS_PROJECT_ID'] ?? '00000000-0000-0000-0000-000000000000' },
  },

  updates: {
    url: `https://u.expo.dev/${process.env['EAS_PROJECT_ID'] ?? '00000000-0000-0000-0000-000000000000'}`,
    fallbackToCacheTimeout: 3000,
  },
  runtimeVersion: { policy: 'appVersion' },

  owner: 'hackerdojo',
};

export default config;
