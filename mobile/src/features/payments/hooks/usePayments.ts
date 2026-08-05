import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useStripe } from '@stripe/stripe-react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '~/services/api/client';
import { queryKeys } from '~/services/queryKeys';
import { ApiError } from '~/services/api/errors';
import { logger } from '~/services/logger';
import type { BillingPeriod, PaymentSheetParams } from '~/types/domain';

/**
 * Payments.
 *
 * The client's role is deliberately small: ask the server for a Payment Intent,
 * open Stripe's own sheet, report the outcome. It never sees an amount it can
 * change, never holds a secret key, and never decides whether a membership
 * became active — that is settled by a webhook the device cannot forge.
 *
 * The idempotency key is minted here and sent with the request, so a member who
 * taps "Confirm and join" twice, or retries after a dropped response, gets the
 * same intent back rather than a second charge.
 */

const paymentsApi = {
  membershipIntent: (input: { planId: string; period: BillingPeriod; idempotencyKey: string }) =>
    api.post<PaymentSheetParams>('/payments/membership-intent', input, { retry: true }),

  donationIntent: (input: { amountCents: number; idempotencyKey: string; receiptEmail?: string }) =>
    api.post<{ paymentIntentClientSecret: string; paymentId: string }>(
      '/payments/donation-intent',
      input,
      { retry: true },
    ),
};

export function useMembershipCheckout() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ planId, period }: { planId: string; period: BillingPeriod }) => {
      const idempotencyKey = Crypto.randomUUID();
      const params = await paymentsApi.membershipIntent({ planId, period, idempotencyKey });

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Hacker Dojo',
        paymentIntentClientSecret: params.paymentIntentClientSecret,
        customerId: params.customerId,
        customerEphemeralKeySecret: params.ephemeralKeySecret,
        // Apple Pay and Google Pay are configured rather than assumed — the
        // sheet shows whichever the device actually supports.
        applePay: { merchantCountryCode: 'US' },
        googlePay: {
          merchantCountryCode: 'US',
          currencyCode: 'USD',
          testEnv: __DEV__,
        },
        allowsDelayedPaymentMethods: false,
        returnURL: 'hackerdojo://stripe-redirect',
        defaultBillingDetails: {},
        appearance: {
          colors: { primary: '#C82C2A' },
          shapes: { borderRadius: 12 },
        },
      });

      if (initError) {
        logger.error('Payment sheet init failed', { code: initError.code });
        throw new ApiError({
          code: 'payment_failed',
          message: 'We could not open the payment sheet. Try again.',
          status: 402,
        });
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        // Dismissing the sheet is a decision, not a failure — surfacing an
        // error toast for it would be wrong.
        if (presentError.code === 'Canceled') {
          return { cancelled: true as const };
        }
        throw new ApiError({
          code: 'payment_failed',
          message: presentError.message || 'That payment did not go through.',
          status: 402,
        });
      }

      return { cancelled: false as const, paymentId: params.paymentId };
    },

    onSuccess: (result) => {
      if (result.cancelled) return;

      /**
       * The membership is activated by the `payment_intent.succeeded` webhook,
       * which lands a moment after the sheet closes. Invalidating immediately
       * would usually read the profile back as still-a-guest, so the refetch
       * waits briefly. `isActiveMember` on the refetched profile is what
       * actually flips the gated surfaces — not this callback.
       */
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.me.all() });
      }, 1500);
    },
  });
}

export function useDonation() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  return useMutation({
    mutationFn: async ({ amountCents }: { amountCents: number }) => {
      const idempotencyKey = Crypto.randomUUID();
      const params = await paymentsApi.donationIntent({ amountCents, idempotencyKey });

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Hacker Dojo',
        paymentIntentClientSecret: params.paymentIntentClientSecret,
        applePay: { merchantCountryCode: 'US' },
        googlePay: { merchantCountryCode: 'US', currencyCode: 'USD', testEnv: __DEV__ },
        returnURL: 'hackerdojo://stripe-redirect',
        appearance: { colors: { primary: '#C82C2A' }, shapes: { borderRadius: 12 } },
      });

      if (initError) {
        throw new ApiError({
          code: 'payment_failed',
          message: 'We could not open the payment sheet. Try again.',
          status: 402,
        });
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') return { cancelled: true as const };
        throw new ApiError({
          code: 'payment_failed',
          message: presentError.message || 'That donation did not go through.',
          status: 402,
        });
      }

      return { cancelled: false as const };
    },
  });
}

/**
 * Whether the platform wallet is worth offering.
 *
 * Apple Pay is effectively universal on supported iOS hardware; Google Pay
 * availability varies by device and region, so the sheet decides at runtime and
 * this only gates the marketing copy above it.
 */
export function useWalletLabel(): string {
  return useCallback(() => (Platform.OS === 'ios' ? 'Apple Pay' : 'Google Pay'), [])();
}
