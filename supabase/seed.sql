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
-- `stripe_price_*` are the Price ids memberships subscribe to. They are the one
-- part of this seed that CANNOT be invented: create the Prices in your own
-- Stripe account and paste the ids here (or update the rows afterwards).
--
-- A plan with no Price id is refused at checkout rather than silently falling
-- back to a one-off charge — that fallback is exactly why memberships used to
-- never renew.
--
insert into public.plans
  (id, name, description, price_monthly_cents, price_annual_cents,
   stripe_price_monthly, stripe_price_annual,
   is_addon, is_popular, requires_proof, sort_order)
values
  ('standard', 'Standard', 'Month to month. Full access, 24/7.', 15000, 135000,
   null, null, false, true,  false, 1),
  ('student',  'Student',  'Current student ID verification required.', 7500, 67500,
   null, null, false, false, true,  2),
  ('veteran',  'Veteran',  'Service verification (DD-214) required.', 13500, 121500,
   null, null, false, false, true,  3),
  ('desk',     'Dedicated Desk', 'Add-on to any plan. Your own desk, monitor and locker.', 22500, null,
   null, null, true, false, false, 4)
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
insert into public.startups (name, mark, tagline, stage, founded_year, hiring, sort_order) values
  ('Pebble',    'PB', 'E-paper smartwatch that ran the first great Kickstarter campaign.', 'Acquired',     '2009', false, 1),
  ('Ferrite',   'FR', 'Storage engine for time-series at the edge.',                       'Series A',     '2020', true,  2),
  ('Palletron', 'PL', 'Autonomous pallet movers for mid-size warehouses.',                 'Seed',         '2018', true,  3),
  ('Openbench', 'OB', 'Benchtop bio kits priced for community labs.',                      'Grant-funded', '2021', false, 4),
  ('Torchlight','TL', 'Inference serving for teams without a GPU cluster.',                'Seed',         '2022', true,  5),
  ('Rowline',   'RW', 'Teleoperated pruning rigs for specialty orchards.',                 'Pre-seed',     '2024', true,  6)
on conflict (name) do nothing;

insert into public.testimonials (name, role, quote, sort_order) values
  ('Eric Migicovsky', 'Founder, Pebble',
   'We built the first Pebble prototypes at a table in the Dojo. The space gave us the two things a hardware startup can''t buy early: tools and neighbours who''d already made our mistakes.', 1),
  ('Steve Wozniak', 'Co-founder, Apple',
   'This is what the Homebrew Computer Club felt like. People building things badly on purpose, in public, until they got good.', 2),
  ('Chris Messina', 'Inventor of the hashtag',
   'The Dojo is one of the last places in the valley where nobody asks what you do for a living before they help you.', 3),
  ('Austin Allred', 'Founder, Lambda School',
   'Cheap space plus serious people is the whole formula. Hacker Dojo has been running that formula since before it was fashionable.', 4);

insert into public.press_mentions (outlet, year, headline, sort_order) values
  ('The New York Times', '2023', 'Inside the hackerspace that outlasted the startups it launched', 1),
  ('WIRED',              '2022', 'Where hardware founders go when the garage runs out of room',    2),
  ('Financial Times',    '2021', 'The nonprofit clubhouse of Silicon Valley''s hardware revival',  3),
  ('VentureBeat',        '2019', 'Fifteen companies that started at a folding table in Mountain View', 4),
  ('Mercury News',       '2017', 'Hacker Dojo finds a permanent home on Maude Avenue',            5),
  ('Slate',              '2014', 'What a hackerspace teaches about learning in public',           6);

insert into public.board_members (name, role, sort_order) values
  ('Katherine Ling',  'Board chair',            1),
  ('Omar Haddad',     'Treasurer',              2),
  ('Rosa Iglesias',   'Secretary · programs',   3),
  ('Daniel Okonkwo',  'Facilities & safety',    4),
  ('Hana Sugiyama',   'Advisor · hardware',     5),
  ('Gabriel Stern',   'Advisor · nonprofit law',6);

insert into public.faqs (question, answer, sort_order) values
  ('How fast can I get started?',
   'Sign up online and you can badge in the same day. A steward walks you through the floor, the labs and the booking rules in about twenty minutes.', 1),
  ('Is there a commitment? Can I cancel?',
   'Monthly membership is month to month — cancel any time before your renewal date and access ends at the end of the paid period.', 2),
  ('How does annual billing work?',
   'Annual Standard is $1,350 charged once, which works out to $112.50 a month and saves $450 against monthly. Annual plans are non-refundable but transferable once.', 3),
  ('How do student and veteran rates get verified?',
   'Upload a current student ID or a DD-214 in the member portal. Verification is usually same-day and the discounted rate applies from your next invoice.', 4),
  ('Can I get a dedicated desk?',
   'Yes — a dedicated desk is a $225/mo add-on on top of any plan, subject to availability. There is usually a short waitlist.', 5),
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
