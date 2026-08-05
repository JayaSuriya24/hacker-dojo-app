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
