import { useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import { SheetScreen } from '~/components/SheetScreen';
import { Button, Card, ListSkeleton, Text } from '~/components/ui';
import { useMembershipCheckout } from '~/features/payments/hooks/usePayments';
import { usePlans } from '~/features/profile/hooks/useProfile';
import { usePalette } from '~/providers/ThemeProvider';
import { userMessage } from '~/services/api/errors';
import { periodLabel, priceFor } from '~/features/payments/billingPeriod';
import { formatCurrency } from '~/utils/format';
import { radius, space } from '~/theme/tokens';
import type { BillingPeriod } from '~/types/domain';

/**
 * Membership checkout.
 *
 * The summary is rendered from the plan record the server returned, and the
 * amount actually charged is decided server-side from the same record — this
 * screen sends a plan id and a period, never a price. Card entry happens inside
 * Stripe's own sheet, so no payment field exists in this codebase at all.
 */
export default function CheckoutSheet() {
  const palette = usePalette();
  const { planId, period } = useLocalSearchParams<{ planId: string; period?: BillingPeriod }>();

  const plans = usePlans();
  const checkout = useMembershipCheckout();

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const plan = plans.data?.find((entry) => entry.id === planId);
  const billingPeriod: BillingPeriod = period === 'year' ? 'year' : 'month';

  // The amount shown here and the amount Stripe charges are both derived from
  // the plan record and the same period value, so the summary cannot claim one
  // price while the sheet takes another.
  const cents = plan ? priceFor(billingPeriod, plan) : 0;

  const pay = async () => {
    if (!plan) return;
    setError(null);

    try {
      const result = await checkout.mutateAsync({ planId: plan.id, period: billingPeriod });
      if (!result.cancelled) setDone(true);
    } catch (caught) {
      setError(userMessage(caught));
    }
  };

  if (done) {
    return (
      <SheetScreen eyebrow="Welcome" title="You're in">
        <YStack gap={space[5]} alignItems="center" paddingVertical={space[8]}>
          <Text variant="small" tone="muted" center>
            Your {plan?.name} plan is active. Pick up your keycard at the front desk on your first
            visit — a steward will walk you through the floor and the labs.
          </Text>
          <YStack alignSelf="stretch" marginTop={space[4]}>
            <Button
              variant="primary"
              fullWidth
              onPress={() => {
                router.back();
                router.replace('/(app)/(tabs)');
              }}
            >
              Start using the Dojo
            </Button>
          </YStack>
        </YStack>
      </SheetScreen>
    );
  }

  if (plans.isPending) {
    return (
      <SheetScreen title="Membership">
        <ListSkeleton count={2} height={100} />
      </SheetScreen>
    );
  }

  if (!plan) {
    return (
      <SheetScreen title="Membership">
        <Text variant="small" tone="muted">
          That plan is not available. Go back and pick another.
        </Text>
      </SheetScreen>
    );
  }

  return (
    <SheetScreen
      eyebrow="Membership"
      title={plan.name}
      footer={
        <YStack gap={space[3]}>
          <Button
            variant="commit"
            size="lg"
            fullWidth
            loading={checkout.isPending}
            disabled={checkout.isPending}
            onPress={() => void pay()}
          >
            {checkout.isPending ? 'Opening payment…' : 'Confirm and join'}
          </Button>
          <Text variant="caption" tone="subtle" center>
            {Platform.OS === 'ios' ? 'Apple Pay' : 'Google Pay'} and cards accepted · secured by
            Stripe
          </Text>
        </YStack>
      }
    >
      <YStack gap={space[5]}>
        {error ? (
          <View
            aria-live="assertive"
            role="alert"
            style={{
              backgroundColor: palette.errorTint,
              borderWidth: 1,
              borderColor: palette.error,
              borderRadius: radius.md,
              padding: space[4],
            }}
          >
            <Text variant="small" tone="error">
              {error}
            </Text>
          </View>
        ) : null}

        <Card>
          <XStack paddingVertical={space[2]}>
            <Text variant="small" tone="muted" flex={1}>
              Plan
            </Text>
            <Text variant="small">{plan.name}</Text>
          </XStack>

          <XStack paddingVertical={space[2]}>
            <Text variant="small" tone="muted" flex={1}>
              Billing
            </Text>
            <Text variant="small">{periodLabel(billingPeriod)}</Text>
          </XStack>

          <XStack paddingVertical={space[2]}>
            <Text variant="small" tone="muted" flex={1}>
              Starts
            </Text>
            <Text variant="small">Today</Text>
          </XStack>

          <View style={{ height: 1, backgroundColor: palette.border, marginVertical: space[3] }} />

          <XStack alignItems="baseline">
            <Text variant="subtitle" flex={1}>
              Billed today
            </Text>
            <Text variant="mono" tone="accent" fontSize={16}>
              {formatCurrency(cents)}
            </Text>
          </XStack>
        </Card>

        <Text variant="caption" tone="subtle">
          {plan.description} Cancel any time from Dojo › Membership — access continues to the end of
          the paid period. No long-term contract.
        </Text>

        {plan.requiresProof ? (
          <Card tone="alt">
            <Text variant="small" tone="muted">
              This rate needs verification. Upload a current student ID or a DD-214 from Profile &
              settings after joining — usually same-day, and the rate applies from your next
              invoice.
            </Text>
          </Card>
        ) : null}
      </YStack>
    </SheetScreen>
  );
}
