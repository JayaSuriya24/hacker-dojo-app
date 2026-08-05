import { XStack, YStack } from 'tamagui';
import { Button, Card, Chip, Text } from '~/components/ui';
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
  period: 'mo' | 'yr';
  activePlanId?: string | undefined;
  onChoose: (plan: Plan) => void;
  isMember: boolean;
}) {
  const annual = period === 'yr';

  return (
    <YStack gap={space[4]}>
      {plans.map((plan) => {
        // Add-ons bill monthly only; showing an annual price for one would be a
        // number that does not exist.
        const showAnnual = annual && !plan.isAddon && plan.priceAnnualCents !== null;
        const cents = showAnnual ? (plan.priceAnnualCents as number) : plan.priceMonthlyCents;
        const isCurrent = isMember && plan.id === activePlanId;

        return (
          <Card
            key={plan.id}
            borderColor={plan.isPopular ? '$accentBorder' : '$borderColor'}
            accessible
            accessibilityLabel={`${plan.name}, ${formatCurrency(cents)} per ${showAnnual ? 'year' : 'month'}. ${plan.description}`}
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
                {plan.isAddon ? '/mo add-on' : showAnnual ? '/yr' : '/mo'}
              </Text>
            </XStack>

            <Text variant="small" tone="muted" marginTop={space[2]}>
              {plan.description}
              {showAnnual && plan.priceAnnualCents
                ? ` Works out to ${formatCurrency(Math.round(plan.priceAnnualCents / 12))} a month.`
                : ''}
            </Text>

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
