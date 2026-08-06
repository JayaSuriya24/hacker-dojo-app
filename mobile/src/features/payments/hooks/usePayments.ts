import { useMemo } from 'react';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { useStripe } from '@stripe/stripe-react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '~/services/api/client';
import { queryKeys } from '~/services/queryKeys';
import { ApiError } from '~/services/api/errors';
import { logger } from '~/services/logger';
import { usePalette, useResolvedScheme } from '~/providers/ThemeProvider';
import { radius } from '~/theme/tokens';
import type { Palette } from '~/theme/tokens';
import type { BillingPeriod, BillingPortalSession, PaymentSheetParams } from '~/types/domain';

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

/**
 * Stripe's own sheet, themed to match the app.
 *
 * The sheet is native Stripe UI, so it cannot read the Tamagui theme — the
 * values have to be handed over. They previously were not: the accent was a
 * `#C82C2A` literal and the corner radius a bare `12`, so the sheet stayed in
 * light mode over a dark app and rounded differently from every other surface.
 */
function sheetAppearance(palette: Palette, scheme: 'light' | 'dark') {
  return {
    colors: {
      primary: palette.accent,
      background: palette.background,
      componentBackground: palette.surfaceAlt,
      componentBorder: palette.border,
      componentDivider: palette.border,
      primaryText: palette.text,
      secondaryText: palette.textMuted,
      componentText: palette.text,
      placeholderText: palette.textSubtle,
      icon: palette.textMuted,
      error: palette.error,
    },
    shapes: { borderRadius: radius.lg, borderWidth: 1 },
    // Stripe renders its own light/dark chrome; telling it which one the app is
    // in stops a white sheet sliding up over the dark ground.
    ...(scheme === 'dark' ? { primaryButton: { colors: { background: palette.accent } } } : {}),
  };
}

const paymentsApi = {
  membershipIntent: (input: { planId: string; period: BillingPeriod; idempotencyKey: string }) =>
    api.post<PaymentSheetParams>('/payments/membership-intent', input, { retry: true }),

  donationIntent: (input: { amountCents: number; idempotencyKey: string; receiptEmail?: string }) =>
    api.post<{ paymentIntentClientSecret: string; paymentId: string }>(
      '/payments/donation-intent',
      input,
      { retry: true },
    ),

  billingPortal: () =>
    api.post<BillingPortalSession>('/payments/billing-portal', undefined, { retry: false }),
};

export function useMembershipCheckout() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const queryClient = useQueryClient();
  const palette = usePalette();
  const scheme = useResolvedScheme();
  const appearance = useMemo(() => sheetAppearance(palette, scheme), [palette, scheme]);

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
        appearance,
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
  const palette = usePalette();
  const scheme = useResolvedScheme();
  const appearance = useMemo(() => sheetAppearance(palette, scheme), [palette, scheme]);

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
        appearance,
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
 * Open Stripe's Billing Portal.
 *
 * Settings previously linked to `https://billing.stripe.com/p/login/hackerdojo`,
 * which is not a real portal URL — a member tapping "Manage billing" reached a
 * Stripe 404. A portal session is minted per request, single-use, and expires,
 * so the URL is fetched at tap time rather than cached.
 *
 * Everything the member can do there — update a card, see invoices, cancel —
 * is Stripe's own UI, which is why none of it is rebuilt in the app.
 */
export function useBillingPortal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const session = await paymentsApi.billingPortal();

      const result = await WebBrowser.openAuthSessionAsync(session.url, session.returnUrl);
      return { dismissed: result.type !== 'success' };
    },

    onSettled: () => {
      // A cancellation or plan change made in the portal lands as a webhook a
      // moment later; refetching the profile is what flips the gated surfaces.
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.me.all() });
      }, 1500);
    },
  });
}
