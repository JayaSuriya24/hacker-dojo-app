/**
 * Jest, via the `jest-expo` preset.
 *
 * `transformIgnorePatterns` is the load-bearing line: node_modules is not
 * transformed by default, but React Native and most Expo packages ship
 * untranspiled ESM/Flow, so anything imported through them has to be allowed
 * through Babel or every test fails on an unexpected `import` token.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|tamagui|@tamagui/.*|@stripe/stripe-react-native|react-native-reanimated|react-native-worklets|standard-navigation|@legendapp/.*)',
  ],
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/src/$1',
  },
  // Font assets are binary; importing one under Jest would try to parse a TTF
  // as JavaScript. The loader hook is exercised through `useAppFonts` instead.
  transform: {
    '^.+\\.(ttf|otf|png|jpg|jpeg|webp|svg)$': '<rootDir>/jest.assetTransformer.js',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/types/**'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
};
