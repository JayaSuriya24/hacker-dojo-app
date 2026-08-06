import type { BillingPeriod } from '~/types/domain';

/**
 * The billing-period mapping layer.
 *
 * Two vocabularies exist and both are right in their own place: the segmented
 * control is labelled "Monthly / Annual" and stores the compact `'mo' | 'yr'`,
 * while the API and Stripe speak `'month' | 'year'`. What was missing was
 * anything connecting them.
 *
 * The consequence was a real billing bug rather than a naming inconsistency.
 * `dojo.tsx` passed `period: plan.isAddon ? 'month' : 'month'` — both branches
 * the same literal — so a member who selected Annual saw the annual price and
 * the "Save $135" chip, then reached a checkout sheet that displayed and
 * charged the monthly rate. Nothing caught it because the two vocabularies
 * never met in a position where the type checker could compare them.
 *
 * They meet here, exhaustively, and every screen goes through these functions.
 */

/** What the Monthly/Annual control stores. Short because it is a UI concern. */
export type BillingPeriodChoice = 'mo' | 'yr';

/** UI choice → the value the API and Stripe accept. */
export function toApiPeriod(choice: BillingPeriodChoice): BillingPeriod {
  return choice === 'yr' ? 'year' : 'month';
}

/** API value → the control's selection, for rendering an existing membership. */
export function toChoice(period: BillingPeriod | string): BillingPeriodChoice {
  return period === 'year' ? 'yr' : 'mo';
}

/**
 * The period a plan will actually bill at.
 *
 * Add-ons bill monthly only, so an add-on chosen while the control says Annual
 * must still check out as a month — otherwise the sheet would ask Stripe for a
 * price that does not exist. Keeping this rule beside the mapping means the two
 * screens that need it cannot disagree.
 */
export function resolvePeriod(
  choice: BillingPeriodChoice,
  plan: { isAddon: boolean; priceAnnualCents: number | null },
): BillingPeriod {
  if (plan.isAddon || plan.priceAnnualCents === null) return 'month';
  return toApiPeriod(choice);
}

/** The amount that will be charged, in cents, for a plan at a given period. */
export function priceFor(
  period: BillingPeriod,
  plan: { priceMonthlyCents: number; priceAnnualCents: number | null },
): number {
  return period === 'year' && plan.priceAnnualCents !== null
    ? plan.priceAnnualCents
    : plan.priceMonthlyCents;
}

/** "/yr" or "/mo" — the suffix beside a price. */
export function periodSuffix(period: BillingPeriod, isAddon: boolean): string {
  if (isAddon) return '/mo add-on';
  return period === 'year' ? '/yr' : '/mo';
}

/** "Every year" / "Every month" — the checkout summary line. */
export function periodLabel(period: BillingPeriod): string {
  return period === 'year' ? 'Every year' : 'Every month';
}
