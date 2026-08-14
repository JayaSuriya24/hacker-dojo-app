import { XStack, YStack } from 'tamagui';
import { Button, Card, Chip, Text } from '~/components/ui';
import { periodSuffix, resolvePeriod } from '~/features/payments/billingPeriod';
import type { BillingPeriodChoice } from '~/features/payments/billingPeriod';
import { formatCurrency } from '~/utils/format';
import { space } from '~/theme/tokens';
import type { Plan } from '~/types/domain';

/**
 * The membership plans.
 *
 * Prices come from the server in cents and are formatted through `Intl` — the
 * client never computes a price, and the annual saving is derived on the server
 * so the marketing number and the amount actually charged cannot drift.
 */
export function PricingTable({
  plans,
  period,
  activePlanId,
  onChoose,
  isMember,
}: {
  plans: Plan[];
  period: BillingPeriodChoice;
  activePlanId?: string | undefined;
  onChoose: (plan: Plan) => void;
  isMember: boolean;
}) {
  return (
    <YStack gap={space[4]}>
      {plans.map((plan) => {
        // `resolvePeriod` carries the add-on rule: an add-on bills monthly
        // regardless of the toggle, so showing it an annual price would quote a
        // number that does not exist in Stripe.
        const effective = resolvePeriod(period, plan);
        /*
         * `benefits` may be absent, and the screen must not die when it is.
         *
         * `usePlans` caches at the static tier, so a client that loaded the
         * plans before this field existed keeps serving that response for half
         * an hour — and `plan.benefits.length` on it threw, taking the whole
         * Dojo tab down behind the error boundary. The same applies to any app
         * build older than the server it is talking to.
         */
        const benefits = plan.benefits ?? [];
        const showAnnual = effective === 'year';
        const cents = showAnnual ? (plan.priceAnnualCents as number) : plan.priceMonthlyCents;
        const isCurrent = isMember && plan.id === activePlanId;

        return (
          <Card
            key={plan.id}
            borderColor={plan.isPopular ? '$accentBorder' : '$borderColor'}
            accessible
            aria-label={`${plan.name}, ${formatCurrency(cents)} per ${showAnnual ? 'year' : 'month'}. ${
              plan.description || benefits.join('. ')
            }`}
          >
            <XStack alignItems="center" gap={space[2]} flexWrap="wrap">
              <Text variant="title">{plan.name}</Text>
              {plan.isPopular ? <Chip label="Most popular" readOnly /> : null}
              {showAnnual && plan.annualSavingCents ? (
                <Chip label={`Save ${formatCurrency(plan.annualSavingCents)}`} readOnly />
              ) : null}
              {isCurrent ? <Chip label="Current plan" readOnly tone="ok" /> : null}
            </XStack>

            <XStack alignItems="baseline" gap={space[2]} marginTop={space[3]}>
              <Text variant="monoLarge">{formatCurrency(cents)}</Text>
              <Text variant="small" tone="subtle">
                {periodSuffix(effective, plan.isAddon)}
              </Text>
            </XStack>

            {/*
              The note above the list, where a plan has one. Student and
              Standard have none — an empty paragraph would open a gap the
              other two cards do not have, so it is not rendered at all.
            */}
            {plan.description ? (
              <Text variant="small" tone="muted" marginTop={space[2]}>
                {plan.description}
                {showAnnual && plan.priceAnnualCents
                  ? ` Works out to ${formatCurrency(Math.round(plan.priceAnnualCents / 12))} a month.`
                  : ''}
              </Text>
            ) : null}

            {/*
              What the plan actually includes. A list rather than a sentence
              because that is how it is sold and how it is compared — someone
              scanning three cards is looking for the line that differs.
            */}
            {benefits.length > 0 ? (
              <YStack gap={space[1]} marginTop={space[3]}>
                {benefits.map((benefit) => (
                  <XStack key={benefit} gap={space[2]} alignItems="flex-start">
                    <Text variant="small" tone="accent" aria-hidden>
                      ·
                    </Text>
                    <Text variant="small" tone="muted" flex={1}>
                      {benefit}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            ) : null}

            <YStack marginTop={space[4]}>
              <Button
                variant={plan.isPopular && !isMember ? 'primary' : 'secondary'}
                fullWidth
                disabled={isCurrent}
                onPress={() => onChoose(plan)}
              >
                {isCurrent
                  ? 'Current plan'
                  : plan.isAddon
                    ? 'Add to plan'
                    : isMember
                      ? `Switch to ${plan.name}`
                      : `Choose ${plan.name}`}
              </Button>
            </YStack>
          </Card>
        );
      })}
    </YStack>
  );
}
