/* eslint-disable no-undef */

/**
 * Test environment setup.
 *
 * Native modules have no JS implementation under Jest, so anything that would
 * reach across the bridge is mocked here rather than in each test file. Only
 * modules whose real behaviour is a native call are stubbed — pure-JS code
 * (formatters, schemas, the API client) runs for real.
 */

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        apiBaseUrl: 'http://localhost:4000/v1',
        supabaseUrl: 'http://localhost:54321',
        supabaseAnonKey: 'test-anon-key',
        stripePublishableKey: 'pk_test_000',
        variant: 'test',
      },
    },
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

/**
 * AsyncStorage has a native backing store, so the Zustand persist middleware
 * cannot reach it under Jest. The package ships its own mock for exactly this.
 *
 * `require` rather than an import: jest.mock's factory is hoisted above the
 * import block, so an import would not have resolved by the time it runs.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * `expo-font` loads real files through a native module. The hook's contract is
 * "resolved or not", so the mock reports loaded — a test rendering text should
 * not be gated on a font that will never arrive in this environment.
 */
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(async () => undefined),
  isLoaded: () => true,
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  getMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async () => ({
    uri: 'file://out.jpg',
    base64: 'AAAA',
    width: 512,
    height: 512,
  })),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

jest.mock('expo-device', () => ({ modelName: 'iPhone 15' }));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(async () => ({ type: 'success', url: 'hackerdojo://done' })),
  maybeCompleteAuthSession: jest.fn(),
}));
