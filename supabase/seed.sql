-- ============================================================================
-- Seed data — the reference content from the Hacker Dojo design prototype.
--
-- Only content tables are seeded. Profiles, memberships, bookings and payments
-- are deliberately absent: those come from real signups, and seeding them
-- would put fake people in the directory of a fresh environment.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Zones — weights reproduce the occupancy split shown on the Home dial.
-- ---------------------------------------------------------------------------
insert into public.zones (id, name, capacity, weight, sort_order) values
  ('main',     'Main Floor',   55, 0.550, 1),
  ('lab',      'Hardware Lab', 21, 0.210, 2),
  ('quiet',    'Quiet Room',   15, 0.150, 3),
  ('booths',   'Booths',        9, 0.090, 4)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
--
-- These rows must agree with 20260813000400_real_membership_plans.sql, which is
-- where the current product definition is written down and explained.
--
-- Why they have to be restated here at all: `supabase db reset` runs the
-- migrations and THEN this file. That migration states four of the five plans
-- as `update … where id = '<plan>'`, and on a fresh database the table is empty
-- when it runs, so all four UPDATEs match zero rows and only `hive` — the one
-- written as an INSERT — survives. This file then supplied the values the
-- migration had just corrected, so a reset produced the OLD product: Standard
-- and Student carrying annual prices that do not exist, a Veteran plan that is
-- not offered still active and purchasable, and Dedicated Desk as a $225/mo
-- add-on rather than the $325/mo membership it is.
--
-- Stated as the current truth instead, so a fresh database and a migrated one
-- describe the same four plans. `on conflict (id) do nothing` keeps `hive`
-- exactly as the migration inserted it and makes re-running this file a no-op
-- rather than a second copy of anything.
--
-- `veteran` is present but INACTIVE, which is what the migration leaves behind:
-- `memberships.plan_id` references this table, so the row has to exist for the
-- history of anyone who ever held it, and `profileRepository.plans()` filters
-- on `active` so it is never served or purchasable. Its annual price goes with
-- the others — nothing here quotes an annual rate, because none is offered.
--
-- `stripe_price_*` stay null. They are the one part of this seed that CANNOT be
-- invented: create the Prices in your own Stripe account and paste the ids in
-- (or update the rows afterwards). A plan with no Price id is refused at
-- checkout rather than silently falling back to a one-off charge — that
-- fallback is exactly why memberships used to never renew.
--
insert into public.plans
  (id, name, description, price_monthly_cents, price_annual_cents,
   stripe_price_monthly, stripe_price_annual,
   is_addon, is_popular, requires_proof, sort_order, active, benefits)
values
  ('student', 'Student', '', 7500, null,
   null, null, false, false, true, 1, true,
   array[
     '24/7 Access',
     '1GBps symmetrical Wifi',
     'Attended most events free',
     'Discounted event hosting fees',
     'Maker Space access',
     '6 hours a week Conference room reservation',
     'Plenty of open space seating',
     'Proof of full-time registration required'
   ]),

  ('standard', 'Standard', '', 15000, null,
   null, null, false, true, false, 2, true,
   array[
     '24/7 Access',
     '1GBps symmetrical Wifi',
     'Attended most events free',
     'Discounted event hosting fees',
     'Maker Space access',
     '6 hours a week Conference room reservation',
     'Plenty of open space seating'
   ]),

  -- `hive` is inserted by 20260813000400 and is already present by the time
  -- this runs. Restated so this file describes the whole product rather than
  -- the part that happened to be missing; the conflict clause leaves it alone.
  ('hive', 'Hive',
   'Please check availability of Hive desks before reserving. Dedicated Desk (Stand/Sit) in a semi-private room.',
   37500, null,
   null, null, false, false, false, 3, true,
   array[
     '24/7 Access',
     '1GBps Wifi',
     'Attend most events free',
     'Discounted event hosting',
     'Maker Space access',
     'Electronics Lab',
     '6 hours a week Conference room reservation',
     'Mailbox included'
   ]),

  ('desk', 'Dedicated Desk',
   'We will be adding additional Dedicated Desk options soon — please contact us for details!',
   32500, null,
   null, null, false, false, false, 4, true,
   array[
     'Dedicated Desk (Stand/Sit)',
     '24/7 Access',
     '1GBps Wifi',
     'Attend most events free',
     'Discounted event hosting fees',
     'Maker Space access',
     'Electronics Lab',
     '6 hours a week Conference room reservation',
     'Mailbox included'
   ]),

  ('veteran', 'Veteran', 'Service verification (DD-214) required.', 13500, null,
   null, null, false, false, true, 5, false, '{}'::text[])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Resources
-- ---------------------------------------------------------------------------
insert into public.resources
  (slug, kind, name, model, zone_id, seats, amenities, status, requires_cert, min_duration_minutes, max_duration_minutes)
values
  ('prusa-farm',     'hardware', 'Prusa MK4 farm',       '3D printing · 4 units, PLA/PETG',              'lab', null, null, 'available',   false, 60, 240),
  ('bambu-x1',       'hardware', 'Bambu X1 Carbon',      '3D printing · CF-capable, AMS',                'lab', null, null, 'in_use',      false, 60, 240),
  ('glowforge',      'hardware', 'Glowforge Pro laser',  'Laser cutter · 20×12 bed',                     'lab', null, null, 'available',   true,  60, 180),
  ('tormach-440',    'hardware', 'Tormach 440 CNC mill', '3-axis mill · aluminium, steel',               'lab', null, null, 'maintenance', true,  60, 240),
  ('rigol-scope',    'hardware', 'Rigol DS1104Z scope',  'Oscilloscope · 100MHz, 4ch',                   'lab', null, null, 'available',   false, 60, 240),
  ('solder-bench',   'hardware', 'Soldering bench',      'Hakko FX-951 ×3, hot air, microscope',         'lab', null, null, 'available',   false, 60, 240),
  ('electronics-lab','hardware', 'Electronics lab',      'Bench supplies, logic analyzer, reflow oven',  'lab', null, null, 'in_use',      false, 60, 240),
  ('booth-a',        'room',     'Phone Booth A',        null, 'booths',  1, 'Standing desk, acoustic panels',     'in_use',    false, 60, 120),
  ('booth-b',        'room',     'Phone Booth B',        null, 'booths',  1, 'Standing desk, acoustic panels',     'in_use',    false, 60, 120),
  ('booth-c',        'room',     'Phone Booth C',        null, 'booths',  1, 'Standing desk, acoustic panels',     'available', false, 60, 120),
  ('small-meeting',  'room',     'Small Meeting Room',   null, 'main',    6, '55" display, whiteboard',            'available', false, 60, 240),
  ('large-conf',     'room',     'Large Conference',     null, 'main',   24, 'Projector, Owl cam, mics',           'available', false, 60, 240),
  ('event-hall',     'room',     'Event Hall',           null, 'main',  150, 'PA, stage lights, streaming',        'in_use',    false, 60, 240)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Events — relative to today so a fresh environment always has a live feed.
-- ---------------------------------------------------------------------------
insert into public.events (slug, title, category, host_name, room_name, starts_at, ends_at, capacity)
values
  ('rust-after-dark',      'Rust After Dark: async internals',        'Hackathons', 'Priya Raman',           'Large Conference', current_date + interval '18 hours 30 minutes', current_date + interval '21 hours',              60),
  ('soldering-clinic',     'Soldering Clinic — bring a dead board',   'Hardware',   'Diego Salazar',         'Hardware Lab',     current_date + interval '19 hours',            current_date + interval '21 hours',              24),
  ('evals-not-vibes',      'Evals, not vibes: measuring RAG',         'AI/ML',      'Wen Li',                'Small Meeting',    current_date + interval '20 hours 15 minutes', current_date + interval '21 hours 45 minutes',   20),
  ('48-hour-build',        '48-Hour Build: agents that ship',         'Hackathons', 'Dojo Programs',         'Event Hall',       current_date + interval '2 days 9 hours',      current_date + interval '4 days 18 hours',      120),
  ('founder-office-hours', 'Founder Office Hours',                    'Community',  'Chris Okafor',          'Phone Booth C',    current_date + interval '5 days 17 hours',     current_date + interval '5 days 19 hours',        8),
  ('cnc-for-the-fearful',  'CNC for people who fear CNC',             'Hardware',   'Elena Vasquez',         'Hardware Lab',     current_date + interval '7 days 18 hours',     current_date + interval '7 days 20 hours',       16),
  ('quantization-night',   'Inference on a budget: quantization night','AI/ML',     'Ravi Menon',            'Large Conference', current_date + interval '9 days 19 hours',     current_date + interval '9 days 21 hours',       60),
  ('potluck-demo-night',   'Community Potluck & Demo Night',          'Community',  'Dojo Community',        'Event Hall',       current_date + interval '13 days 18 hours',    current_date + interval '13 days 22 hours',     150),
  ('benchtop-bio-101',     'Benchtop Bio 101',                        'Community',  'Sarah Kwan',            'Small Meeting',    current_date + interval '16 days 14 hours',    current_date + interval '16 days 16 hours',      18),
  ('robot-fight-club',     'Robot Fight Club (friendly)',             'Hardware',   'Jonas Brandt',          'Event Hall',       current_date + interval '21 days 19 hours',    current_date + interval '21 days 22 hours',     100),
  ('sensors-weekend',      'Hardware Hackathon: sensors weekend',     'Hardware',   'Dojo Programs',         'Event Hall',       current_date + interval '23 days 10 hours',    current_date + interval '24 days 18 hours',      90),
  ('prompt-to-product',    'Prompt to product: shipping with agents', 'AI/ML',      'AI Career Initiative',  'Large Conference', current_date + interval '27 days 18 hours',    current_date + interval '27 days 20 hours',      60)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Programs and tracks
-- ---------------------------------------------------------------------------
insert into public.programs (id, name, meta, blurb, sort_order) values
  ('aci',   'AI Career Initiative', 'Rolling cohorts · 8 weeks · hybrid',
   'Three tracks for engineers and operators rebuilding their leverage in an AI-shaped market. Cohorts of 20, taught on the floor by working practitioners.', 1),
  ('acc',   'Accelerator', 'Sep 8 – Dec 5 · in person · 12 teams',
   'A twelve-week, non-dilutive accelerator for deep-tech and hardware teams. Bench space, machine time, weekly reviews and a demo day in the Event Hall.', 2),
  ('stars', 'AI Stars', 'Year-round · Saturdays · ages 14–18',
   'A free Saturday program for high schoolers: Python, notebooks, small models, and a June showcase. No prior experience, no laptop required.', 3),
  ('camp',  'Summer Camp', 'Jun–Aug · weekly sessions · ages 9–13',
   'Week-long maker camps: soldering, printing, small robots and a Friday build fair for families.', 4)
on conflict (id) do nothing;

insert into public.program_tracks (program_id, name, description, audience, outcome, sort_order) values
  ('aci', 'Regain Your Leverage',
   'A structured pivot for people whose role was displaced or narrowed by automation. Skills audit, portfolio rebuild, and a paid-project push.',
   'Mid-career ICs and managers in transition', 'A shipped portfolio project and 10 warm intros', 1),
  ('aci', 'Become Irreplaceable',
   'Workflow automation and autonomous agents applied to your actual job. You leave with agents running in production against real company processes.',
   'Employed engineers, analysts and ops leads', 'Two agents in production and an internal case study', 2),
  ('aci', 'Launch Your Vision',
   'Build and ship a micro-SaaS without a technical co-founder. Weekly build reviews, a design steward, and a demo-night launch.',
   'Domain experts and non-engineer founders', 'A live product with paying users by week eight', 3),
  ('acc', 'What you get',
   'Dedicated bench, priority machine time, a hardware steward, legal and manufacturing office hours, and demo day in front of 300 people.',
   'Pre-seed teams with a working prototype', 'A manufacturable v1 and an investor-ready demo', 1),
  ('stars', 'Curriculum',
   'Twelve Saturdays of fundamentals, then a mentored project. Laptops are lent for the term.',
   'High school students in Santa Clara County', 'A project shown at the June showcase', 1),
  ('camp', 'A week at camp',
   'Mornings on fundamentals, afternoons on the build. Ends with a Friday build fair.',
   'Kids 9–13, all experience levels', 'A finished build to take home', 1)
on conflict (program_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Community content
-- ---------------------------------------------------------------------------
-- Pebble is the only startup seeded, because it is the only one of the six that
-- existed. Ferrite, Palletron, Openbench, Torchlight and Rowline were invented
-- for the prototype and rendered on the Community tab as "Founded at the Dojo",
-- four of them carrying a Hiring badge — an open-roles claim on behalf of
-- companies with no roles, because they have no existence. Migration
-- 20260814000100 removes them from databases that already have them.
--
-- Pebble's own line is a matter of record: it was built at the Dojo and the
-- Kickstarter is public. Nothing invented replaces the other five; the list
-- guards on length in the client and simply renders shorter.
--
-- `slug` is supplied explicitly. 20260813000200 added the column, backfilled it
-- from `name`, then made it NOT NULL — but nothing derives it on insert, so
-- this seed has been failing with a 23502 since that migration landed, taking
-- the whole `supabase db reset` down with it. 'pebble' is what that migration's
-- own backfill expression produces for this name.
insert into public.startups (name, slug, mark, tagline, stage, founded_year, hiring, sort_order) values
  ('Pebble', 'pebble', 'PB', 'E-paper smartwatch that ran the first great Kickstarter campaign.', 'Acquired', '2009', false, 1)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- `testimonials`, `press_mentions` and `board_members` are deliberately NOT
-- seeded, and this comment is the seed for them.
--
-- They used to be. The quotes were attributed to Eric Migicovsky, Steve
-- Wozniak, Chris Messina and Austin Allred, who never said them; the headlines
-- were invented and run under the New York Times, WIRED, the Financial Times,
-- VentureBeat, Mercury News and Slate mastheads; the board was six invented
-- people standing in for the actual governing board of a real 501(c)(3), which
-- is public record on its Form 990.
--
-- Migration 20260814000000 deleted all of it. That fixed the database it ran
-- against and nothing else: `supabase db reset` runs migrations and THEN this
-- file, so every one of those rows came straight back on any fresh
-- environment, with the migration's own explanation sitting upstream of it.
--
-- Nothing replaces them, because the honest replacement is nothing. Each of
-- these sections guards on length in the client and renders as absent when its
-- table is empty. Real quotes, real coverage and the real board can be entered
-- through the staff tools whenever the Dojo has them.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- FAQs
--
-- Two answers here stated prices this database contradicts, and unlike the copy
-- above, a member can act on a wrong price. Both were corrected by migration
-- 20260814000000 and are carried in corrected form below, so a reset produces
-- the same seven answers a migrated database already serves:
--
--   * "How does annual billing work?" is gone rather than rewritten. It
--     described Annual Standard at $1,350, and `plans.price_annual_cents` is
--     null for Standard — the product it explained cannot be bought.
--
--   * The dedicated desk is its own plan, not a $225/mo add-on. The answer now
--     points at the Membership section instead of restating a number, so the
--     price keeps exactly one home: the plans table.
--
--   * The verification answer advertised a veteran rate on an inactive plan
--     `/v1/plans` has never served, and promised the discount "applies from
--     your next invoice" when checkout charges the discounted figure up front.
--
-- `sort_order` 3 is left vacant rather than closed up, so these numbers keep
-- matching a database that took the migration path.
-- ---------------------------------------------------------------------------
insert into public.faqs (question, answer, sort_order) values
  ('How fast can I get started?',
   'Sign up online and you can badge in the same day. A steward walks you through the floor, the labs and the booking rules in about twenty minutes.', 1),
  ('Is there a commitment? Can I cancel?',
   'Monthly membership is month to month — cancel any time before your renewal date and access ends at the end of the paid period.', 2),
  ('How does the student rate get verified?',
   'You are charged the student rate as soon as you join. Upload a current student ID from Profile & settings afterwards and a steward will review it.', 4),
  ('Can I get a dedicated desk?',
   'A dedicated desk is its own membership plan rather than an add-on. See Membership on the Dojo tab for the current price and availability — there is usually a short waitlist.', 5),
  ('Can I host my own event?',
   'Members host events for free in most rooms. Submit a request from the Events tab; the team replies within two business days and handles the calendar listing.', 6),
  ('Where exactly are you?',
   '855 Maude Ave, Mountain View, CA 94043 — five minutes on foot from Middlefield VTA, one minute from Bus 21, with free parking on site.', 7),
  ('Do you run tours?',
   'Free 30-minute tours run most afternoons and evenings. Book one from the Dojo tab and ask for the steward at the front desk.', 8);

-- A starting occupancy sample per zone so the Home dial is never empty.
insert into public.occupancy_samples (zone_id, head_count) values
  ('main', 23), ('lab', 9), ('quiet', 6), ('booths', 4);

-- ---------------------------------------------------------------------------
-- Occupancy: seed one sample per zone so the Home dial has something to draw
-- before the API's scheduler has run for the first time. From then on
-- `sample_occupancy()` appends a real reading every minute.
-- ---------------------------------------------------------------------------
select public.sample_occupancy();
