import type { ReactNode } from 'react';

/**
 * Web stub for `@stripe/stripe-react-native`.
 *
 * Stripe's React Native SDK has no web implementation — no `browser` field, no
 * web build — so on web Metro resolves its `main` into the real `react-native`
 * package rather than `react-native-web` and the bundle dies on an RN internal
 * that only exists as `.ios.js` / `.android.js`.
 *
 * `metro.config.js` aliases the package to this file when `platform === 'web'`,
 * which keeps `npm run web` usable for laying out screens. Payments themselves
 * are NOT supported there: rather than silently doing nothing, the sheet
 * functions return an explicit error so a caller cannot mistake a no-op for a
 * completed charge.
 *
 * iOS and Android are unaffected — they resolve the real SDK.
 */

const UNSUPPORTED = {
  code: 'Failed' as const,
  message: 'Payments are only available in the iOS and Android apps.',
};

export function StripeProvider({ children }: { children?: ReactNode }): ReactNode {
  return children ?? null;
}

export function useStripe() {
  return {
    initPaymentSheet: async () => ({ error: UNSUPPORTED }),
    presentPaymentSheet: async () => ({ error: UNSUPPORTED }),
    confirmPayment: async () => ({ error: UNSUPPORTED }),
    createPaymentMethod: async () => ({ error: UNSUPPORTED }),
    handleNextAction: async () => ({ error: UNSUPPORTED }),
    retrievePaymentIntent: async () => ({ error: UNSUPPORTED }),
  };
}

export const isPlatformPaySupported = async (): Promise<boolean> => false;
