import { useState } from 'react';
import { router } from 'expo-router';
import { YStack } from 'tamagui';
import { AuthShell } from '~/features/auth/components/AuthShell';
import { PricingTable } from '~/features/dojo/components/PricingTable';
import { usePlans } from '~/features/profile/hooks/useProfile';
import type { BillingPeriodChoice } from '~/features/payments/billingPeriod';
import { Button, ListSkeleton, Segmented, Text } from '~/components/ui';
import { space } from '~/theme/tokens';

/**
 * Membership pricing, before anyone has an account.
 *
 * `GET /plans` is public precisely so this screen can exist: "what does it
 * cost?" is the question a prospective member asks first, and answering it only
 * after they have handed over an email is the wrong way round.
 *
 * Choosing here does NOT carry a plan into signup. A membership attaches to an
 * account, so the account has to exist first, and the real choice is made from
 * the Dojo tab once they are in. This screen answers the price question and
 * hands off — it does not pretend to take an order.
 */
export default function PlansScreen() {
  const plans = usePlans();
  const [period, setPeriod] = useState<BillingPeriodChoice>('mo');

  const selectable = (plans.data ?? []).filter((plan) => !plan.isAddon);

  return (
    <AuthShell heading="Choose your plan">
      <YStack gap={space[5]}>
        <Segmented<BillingPeriodChoice>
          aria-label="Billing period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'mo', label: 'Monthly' },
            { value: 'yr', label: 'Annual' },
          ]}
        />

        {plans.isPending ? (
          <ListSkeleton count={3} height={160} />
        ) : (
          <PricingTable
            plans={selectable}
            period={period}
            isMember={false}
            // Every plan leads to the same place: an account has to exist before
            // a membership can attach to it.
            onChoose={() => router.push('/(auth)/sign-up')}
          />
        )}

        <Text variant="caption" tone="subtle" center>
          Create your account first — you pick and pay for a plan once you are in.
        </Text>

        <Button variant="secondary" fullWidth onPress={() => router.replace('/(auth)/sign-in')}>
          Back to sign in
        </Button>
      </YStack>
    </AuthShell>
  );
}
