import {
  periodLabel,
  periodSuffix,
  priceFor,
  resolvePeriod,
  toApiPeriod,
  toChoice,
} from '../billingPeriod';

/**
 * The billing-period mapping.
 *
 * These exist because the bug they prevent was invisible to the type checker:
 * `dojo.tsx` wrote `period: plan.isAddon ? 'month' : 'month'` — both branches
 * the same literal — so selecting Annual displayed the annual price and the
 * saving chip and then charged monthly. Nothing connected the control's
 * vocabulary to the API's, so nothing could disagree.
 */

const standard = { isAddon: false, priceMonthlyCents: 15000, priceAnnualCents: 135000 };
const addon = { isAddon: true, priceMonthlyCents: 22500, priceAnnualCents: null };
const monthlyOnly = { isAddon: false, priceMonthlyCents: 9900, priceAnnualCents: null };

describe('toApiPeriod', () => {
  it('maps the control values onto the API values', () => {
    expect(toApiPeriod('mo')).toBe('month');
    expect(toApiPeriod('yr')).toBe('year');
  });
});

describe('toChoice', () => {
  it('maps back for rendering an existing membership', () => {
    expect(toChoice('year')).toBe('yr');
    expect(toChoice('month')).toBe('mo');
  });

  it('treats anything unrecognised as monthly rather than throwing', () => {
    // Membership `period` arrives as a string from the API; an unexpected value
    // should degrade to the safer of the two, not crash the Dojo tab.
    expect(toChoice('quarterly')).toBe('mo');
  });
});

describe('resolvePeriod', () => {
  it('honours the annual selection for a plan that offers one', () => {
    expect(resolvePeriod('yr', standard)).toBe('year');
  });

  it('honours the monthly selection', () => {
    expect(resolvePeriod('mo', standard)).toBe('month');
  });

  /**
   * The rule that made the original ternary look defensible. Add-ons really do
   * bill monthly only — but the fix is to encode that here, not to hardcode
   * 'month' for everything.
   */
  it('forces an add-on to monthly even when Annual is selected', () => {
    expect(resolvePeriod('yr', addon)).toBe('month');
  });

  it('forces a plan with no annual price to monthly', () => {
    expect(resolvePeriod('yr', monthlyOnly)).toBe('month');
  });
});

describe('priceFor', () => {
  it('charges the annual price for an annual period', () => {
    expect(priceFor('year', standard)).toBe(135000);
  });

  it('charges the monthly price for a monthly period', () => {
    expect(priceFor('month', standard)).toBe(15000);
  });

  it('falls back to monthly when no annual price exists', () => {
    expect(priceFor('year', monthlyOnly)).toBe(9900);
  });

  /**
   * The regression itself: what the pricing table shows and what checkout
   * charges must be the same number for the same selection.
   */
  it('agrees with the period the table resolved', () => {
    const period = resolvePeriod('yr', standard);
    expect(priceFor(period, standard)).toBe(standard.priceAnnualCents);
  });
});

describe('labels', () => {
  it('suffixes a price correctly', () => {
    expect(periodSuffix('year', false)).toBe('/yr');
    expect(periodSuffix('month', false)).toBe('/mo');
    expect(periodSuffix('month', true)).toBe('/mo add-on');
  });

  it('names the billing cadence in the checkout summary', () => {
    expect(periodLabel('year')).toBe('Every year');
    expect(periodLabel('month')).toBe('Every month');
  });
});
