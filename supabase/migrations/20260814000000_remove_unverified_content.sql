-- ---------------------------------------------------------------------------
-- 0007 · Remove content the Dojo cannot stand behind.
--
-- Everything deleted here was placeholder copy invented when the app was
-- scaffolded, seeded verbatim by 0005, and never edited. It was not wrong in
-- the way a stale figure is wrong — it was asserted about a real 501(c)(3),
-- and in three cases about real, named, living people:
--
--   * `testimonials` put quotes in the mouths of Eric Migicovsky, Steve
--     Wozniak, Chris Messina and Austin Allred. None of them said these words.
--     A fabricated endorsement from an identifiable person is the single worst
--     thing in this database, and it was rendering on the Dojo tab.
--
--   * `press_mentions` attributed invented headlines to The New York Times,
--     WIRED, the Financial Times, VentureBeat, Mercury News and Slate. None of
--     these articles exist. "As seen in the NYT" is a claim a real outlet can
--     and does object to.
--
--   * `board_members` listed six invented people as the governing board of a
--     nonprofit whose actual board is a matter of public record on its Form
--     990. Anyone could check this, and it would be wrong.
--
-- The impact figures go for a quieter reason: "6,400+ members served", "1,180
-- events hosted" and "42 startups launched here" have no source. The last one
-- was not even flattering — the Dojo's own public claim is hundreds of
-- startups, including Pinterest, Pebble and Webflow.
--
-- Nothing here is replaced with a better guess. A section with nothing true to
-- say renders as nothing at all; the client guards on length. Staff can add
-- real testimonials, real coverage and the real board through
-- `PUT /v1/staff/content` and the tables below whenever those exist.
-- ---------------------------------------------------------------------------

delete from public.testimonials;
delete from public.press_mentions;
delete from public.board_members;

-- Impact and pillars both go. "Years running" was briefly kept and derived from
-- the 2009 founding date rather than stored as the string '17' that was correct
-- in August 2026 and would have said 17 forever — but a report of one figure is
-- not a report, and the section was removed from the Dojo tab outright. The
-- `impact` slot has no reader now; rows written to it render nowhere.
delete from public.content_blocks where slot in ('impact', 'pillars');

-- ---------------------------------------------------------------------------
-- Two FAQ answers stated prices that this database contradicts. Unlike the
-- copy above these are about money, and a member can act on them.
-- ---------------------------------------------------------------------------

-- No plan except Veteran carries an annual price: `plans.price_annual_cents`
-- is null for Standard, so "Annual Standard is $1,350" describes a product
-- that cannot be bought. The Dojo tab already dropped its billing-period
-- toggle for exactly this reason; this answer was the last place still
-- claiming annual billing exists.
delete from public.faqs where question = 'How does annual billing work?';

-- A dedicated desk is its own plan at $325/mo, not a $225/mo add-on
-- (`plans.is_addon` is false for it). Rewritten to point at the Membership
-- section rather than restate a number here, so the two cannot drift apart
-- again — the price now has exactly one home, which is the plans table.
update public.faqs
   set answer = 'A dedicated desk is its own membership plan rather than an add-on. See Membership on the Dojo tab for the current price and availability — there is usually a short waitlist.'
 where question = 'Can I get a dedicated desk?';

-- The verification answer was wrong twice over.
--
-- It advertised a veteran rate. The Veteran plan is `active = false`, and
-- `profileRepository.plans()` filters on `active`, so `/v1/plans` has never
-- served it — the rate cannot be selected, and the answer sent people looking
-- for something that is not there.
--
-- It also promised that "the discounted rate applies from your next invoice".
-- `createMembershipIntent` charges `plan.price_monthly_cents` — already the
-- discounted figure — at checkout, before any document exists. Approving one
-- changes no billing: `documentService.review` sets a status and returns.
-- Nothing arrives at the next invoice, because nothing was waiting for it.
--
-- Rewritten to say what the code does. The timing claim ("usually same-day")
-- is dropped rather than kept, because nothing in this repo establishes it;
-- add it back if the stewards can stand behind it.
update public.faqs
   set question = 'How does the student rate get verified?',
       answer   = 'You are charged the student rate as soon as you join. Upload a current student ID from Profile & settings afterwards and a steward will review it.'
 where question = 'How do student and veteran rates get verified?';
