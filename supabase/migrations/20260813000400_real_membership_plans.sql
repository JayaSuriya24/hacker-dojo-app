-- ---------------------------------------------------------------------------
-- The membership plans, as they actually are.
--
-- What was here was placeholder pricing written to exercise the checkout: a
-- Veteran plan the Dojo does not offer, a Dedicated Desk at the wrong price and
-- modelled as an add-on, no Hive tier at all, and an annual price on every plan
-- when the Dojo bills monthly only. A prospective member reads these numbers
-- and decides whether to join, so wrong ones are worse than missing ones.
--
-- Two structural changes, both needed to state a plan honestly:
--
--   1. `benefits` — the plans are sold as a bullet list, and `description` is a
--      single line. Cramming eight benefits into one sentence loses the shape
--      that makes them scannable.
--   2. `price_annual_cents` set to null throughout. There is no annual price to
--      quote. `resolvePeriod` in the app already treats null as "monthly only",
--      so the control degrades rather than breaking.
--
-- Veteran is DEACTIVATED, not deleted: `memberships.plan_id` references this
-- table, and dropping a row would break the history of anyone who ever held it.
-- ---------------------------------------------------------------------------

alter table public.plans add column if not exists benefits text[] not null default '{}'::text[];

comment on column public.plans.benefits is
  'The bullet list shown on the plan card, in display order. `description` carries the note above it, where there is one.';

-- ---------------------------------------------------------------------------
-- Student — $75/mo
-- ---------------------------------------------------------------------------
update public.plans set
  name                = 'Student',
  description         = '',
  price_monthly_cents = 7500,
  price_annual_cents  = null,
  is_addon            = false,
  requires_proof      = true,
  sort_order          = 1,
  active              = true,
  benefits            = array[
    '24/7 Access',
    '1GBps symmetrical Wifi',
    'Attended most events free',
    'Discounted event hosting fees',
    'Maker Space access',
    '6 hours a week Conference room reservation',
    'Plenty of open space seating',
    'Proof of full-time registration required'
  ]
where id = 'student';

-- ---------------------------------------------------------------------------
-- Standard — $150/mo. Student's list without the registration requirement.
-- ---------------------------------------------------------------------------
update public.plans set
  name                = 'Standard',
  description         = '',
  price_monthly_cents = 15000,
  price_annual_cents  = null,
  is_addon            = false,
  requires_proof      = false,
  sort_order          = 2,
  active              = true,
  benefits            = array[
    '24/7 Access',
    '1GBps symmetrical Wifi',
    'Attended most events free',
    'Discounted event hosting fees',
    'Maker Space access',
    '6 hours a week Conference room reservation',
    'Plenty of open space seating'
  ]
where id = 'standard';

-- ---------------------------------------------------------------------------
-- Hive — $375/mo. New: there was no Hive tier at all.
-- ---------------------------------------------------------------------------
insert into public.plans (
  id, name, description, price_monthly_cents, price_annual_cents,
  is_addon, is_popular, requires_proof, sort_order, active, benefits
) values (
  'hive',
  'Hive',
  'Please check availability of Hive desks before reserving. Dedicated Desk (Stand/Sit) in a semi-private room.',
  37500,
  null,
  false,
  false,
  false,
  3,
  true,
  array[
    '24/7 Access',
    '1GBps Wifi',
    'Attend most events free',
    'Discounted event hosting',
    'Maker Space access',
    'Electronics Lab',
    '6 hours a week Conference room reservation',
    'Mailbox included'
  ]
)
on conflict (id) do update set
  name                = excluded.name,
  description         = excluded.description,
  price_monthly_cents = excluded.price_monthly_cents,
  price_annual_cents  = excluded.price_annual_cents,
  is_addon            = excluded.is_addon,
  requires_proof      = excluded.requires_proof,
  sort_order          = excluded.sort_order,
  active              = excluded.active,
  benefits            = excluded.benefits;

-- ---------------------------------------------------------------------------
-- Dedicated Desk — $325/mo, and NOT an add-on.
--
-- It was modelled as `is_addon`, which made it bill monthly-only as a rider on
-- another plan. It is sold as a membership in its own right.
-- ---------------------------------------------------------------------------
update public.plans set
  name                = 'Dedicated Desk',
  description         = 'We will be adding additional Dedicated Desk options soon — please contact us for details!',
  price_monthly_cents = 32500,
  price_annual_cents  = null,
  is_addon            = false,
  requires_proof      = false,
  sort_order          = 4,
  active              = true,
  benefits            = array[
    'Dedicated Desk (Stand/Sit)',
    '24/7 Access',
    '1GBps Wifi',
    'Attend most events free',
    'Discounted event hosting fees',
    'Maker Space access',
    'Electronics Lab',
    '6 hours a week Conference room reservation',
    'Mailbox included'
  ]
where id = 'desk';

-- ---------------------------------------------------------------------------
-- Veteran — retired. Not offered; kept so old memberships still resolve.
-- ---------------------------------------------------------------------------
update public.plans set active = false where id = 'veteran';

notify pgrst, 'reload schema';
