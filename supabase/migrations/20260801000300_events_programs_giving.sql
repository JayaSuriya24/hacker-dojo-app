-- ============================================================================
-- 0004 · Events, programs, startups, tours, giving, payments.
-- ============================================================================

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null check (length(btrim(title)) between 3 and 160),
  description   text,
  category      public.event_category not null,
  status        public.event_status not null default 'published',
  host_profile_id uuid references public.profiles (id) on delete set null,
  host_name     text not null,
  resource_id   uuid references public.resources (id) on delete set null,
  room_name     text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  capacity      integer not null check (capacity > 0),
  cover_path    text,
  members_only  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint events_ends_after_starts check (ends_at > starts_at)
);

create index events_upcoming_idx on public.events (starts_at)
  where status = 'published';
create index events_category_idx on public.events (category, starts_at)
  where status = 'published';

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

create table public.event_rsvps (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  status      public.rsvp_status not null default 'going',
  -- Deterministic per (event, member) so the check-in QR can be re-rendered
  -- offline without another round trip.
  checkin_code text not null default 'DOJO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  checked_in_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, profile_id)
);

create index event_rsvps_event_idx on public.event_rsvps (event_id) where status = 'going';
create index event_rsvps_profile_idx on public.event_rsvps (profile_id);

create trigger event_rsvps_touch before update on public.event_rsvps
  for each row execute function public.touch_updated_at();

-- Capacity is enforced in the database, in the same transaction as the insert.
-- Counting in the API and then inserting would let two concurrent RSVPs both
-- observe capacity-1 and both succeed.
create or replace function public.enforce_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cap integer;
  taken integer;
begin
  if new.status <> 'going' then
    return new;
  end if;

  select capacity into cap from public.events where id = new.event_id for update;

  select count(*) into taken
  from public.event_rsvps
  where event_id = new.event_id
    and status = 'going'
    and (tg_op = 'INSERT' or id <> new.id);

  if taken >= cap then
    -- Not an error: roll the member onto the waitlist so the UI can say so.
    new.status := 'waitlisted';
  end if;

  return new;
end;
$$;

create trigger event_rsvps_capacity
  before insert or update of status on public.event_rsvps
  for each row execute function public.enforce_event_capacity();

-- Denormalised counts are a read-path optimisation; the trigger keeps them
-- honest so the events list never needs a correlated subquery.
create table public.event_stats (
  event_id     uuid primary key references public.events (id) on delete cascade,
  going_count  integer not null default 0,
  waitlist_count integer not null default 0
);

create or replace function public.sync_event_stats()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid := coalesce(new.event_id, old.event_id);
begin
  insert into public.event_stats (event_id, going_count, waitlist_count)
  select
    target,
    count(*) filter (where status = 'going'),
    count(*) filter (where status = 'waitlisted')
  from public.event_rsvps where event_id = target
  on conflict (event_id) do update
    set going_count = excluded.going_count,
        waitlist_count = excluded.waitlist_count;
  return null;
end;
$$;

create trigger event_rsvps_stats
  after insert or update or delete on public.event_rsvps
  for each row execute function public.sync_event_stats();

-- ---------------------------------------------------------------------------
-- Event hosting requests
-- ---------------------------------------------------------------------------
create table public.event_requests (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique default 'REQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 3 and 160),
  category      public.event_category not null,
  expected_size integer not null check (expected_size between 1 and 500),
  preferred_date date not null,
  preferred_room text not null,
  notes         text check (notes is null or length(notes) <= 1000),
  status        public.application_status not null default 'submitted',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index event_requests_profile_idx on public.event_requests (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Programs, tracks, applications
-- ---------------------------------------------------------------------------
create table public.programs (
  id          text primary key,
  name        text not null,
  meta        text not null,
  blurb       text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true
);

create table public.program_tracks (
  id          uuid primary key default gen_random_uuid(),
  program_id  text not null references public.programs (id) on delete cascade,
  name        text not null,
  description text not null,
  audience    text not null,
  outcome     text not null,
  sort_order  integer not null default 0,
  unique (program_id, name)
);

create table public.program_applications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  track_id   uuid not null references public.program_tracks (id) on delete cascade,
  status     public.application_status not null default 'submitted',
  answers    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, track_id)
);

create trigger program_applications_touch before update on public.program_applications
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Static community content
-- ---------------------------------------------------------------------------
create table public.startups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  mark       text not null,
  tagline    text not null,
  stage      text not null,
  founded_year text not null,
  hiring     boolean not null default false,
  website    text,
  sort_order integer not null default 0
);

create table public.testimonials (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text not null,
  quote      text not null,
  sort_order integer not null default 0
);

create table public.press_mentions (
  id         uuid primary key default gen_random_uuid(),
  outlet     text not null,
  year       text not null,
  headline   text not null,
  url        text,
  sort_order integer not null default 0
);

create table public.board_members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text not null,
  sort_order integer not null default 0
);

create table public.faqs (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  answer     text not null,
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Tours
-- ---------------------------------------------------------------------------
create table public.tours (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles (id) on delete set null,
  guest_name    text,
  guest_email   citext,
  scheduled_for timestamptz not null,
  status        public.tour_status not null default 'requested',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A tour is either tied to an account or carries standalone contact details.
  constraint tours_has_contact check (profile_id is not null or guest_email is not null)
);

create index tours_upcoming_idx on public.tours (scheduled_for) where status in ('requested', 'confirmed');

-- ---------------------------------------------------------------------------
-- Payments and donations. Amounts are integer cents — never floats.
-- ---------------------------------------------------------------------------
create table public.payments (
  id                       uuid primary key default gen_random_uuid(),
  profile_id               uuid references public.profiles (id) on delete set null,
  kind                     text not null check (kind in ('membership', 'donation', 'event', 'addon')),
  amount_cents             integer not null check (amount_cents > 0),
  currency                 char(3) not null default 'usd',
  status                   public.payment_status not null default 'requires_payment',
  stripe_payment_intent_id text unique,
  stripe_customer_id       text,
  -- Written by the mobile client, echoed back by Stripe: makes a retried
  -- "Confirm and join" tap idempotent instead of a double charge.
  idempotency_key          text unique,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index payments_profile_idx on public.payments (profile_id, created_at desc);

create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

create table public.donations (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references public.payments (id) on delete cascade,
  profile_id   uuid references public.profiles (id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  anonymous    boolean not null default false,
  receipt_email citext,
  created_at   timestamptz not null default now()
);

-- Stripe redelivers webhooks. This table makes replay a no-op instead of a
-- second membership activation.
create table public.stripe_webhook_events (
  id           text primary key,
  type         text not null,
  processed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.events               enable row level security;
alter table public.event_stats          enable row level security;
alter table public.event_rsvps          enable row level security;
alter table public.event_requests       enable row level security;
alter table public.programs             enable row level security;
alter table public.program_tracks       enable row level security;
alter table public.program_applications enable row level security;
alter table public.startups             enable row level security;
alter table public.testimonials         enable row level security;
alter table public.press_mentions       enable row level security;
alter table public.board_members        enable row level security;
alter table public.faqs                 enable row level security;
alter table public.tours                enable row level security;
alter table public.payments             enable row level security;
alter table public.donations            enable row level security;
alter table public.stripe_webhook_events enable row level security;

-- Published, non-members-only events are the public shop window.
create policy events_select_public on public.events
  for select to anon, authenticated
  using (status = 'published' and not members_only);

create policy events_select_members on public.events
  for select to authenticated
  using (status = 'published' and public.is_active_member());

create policy events_select_own_host on public.events
  for select to authenticated
  using (host_profile_id = auth.uid() or public.is_staff());

create policy event_stats_select_all on public.event_stats
  for select to anon, authenticated using (true);

-- You can see and change only your own RSVP. Head counts come from
-- event_stats, so nobody needs to read the whole RSVP list to render a card.
create policy event_rsvps_select_self on public.event_rsvps
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

create policy event_rsvps_insert_self on public.event_rsvps
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy event_rsvps_update_self on public.event_rsvps
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy event_rsvps_delete_self on public.event_rsvps
  for delete to authenticated
  using (profile_id = auth.uid());

create policy event_requests_select_self on public.event_requests
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

create policy event_requests_insert_self on public.event_requests
  for insert to authenticated
  with check (profile_id = auth.uid() and public.is_active_member());

-- Marketing content: world-readable.
create policy programs_select_all on public.programs
  for select to anon, authenticated using (active);
create policy program_tracks_select_all on public.program_tracks
  for select to anon, authenticated using (true);
create policy startups_select_all on public.startups
  for select to anon, authenticated using (true);
create policy testimonials_select_all on public.testimonials
  for select to anon, authenticated using (true);
create policy press_select_all on public.press_mentions
  for select to anon, authenticated using (true);
create policy board_select_all on public.board_members
  for select to anon, authenticated using (true);
create policy faqs_select_all on public.faqs
  for select to anon, authenticated using (true);

create policy program_applications_select_self on public.program_applications
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());
create policy program_applications_insert_self on public.program_applications
  for insert to authenticated
  with check (profile_id = auth.uid());
create policy program_applications_update_self on public.program_applications
  for update to authenticated
  using (profile_id = auth.uid() and status = 'submitted')
  with check (profile_id = auth.uid());

create policy tours_select_self on public.tours
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

-- Payments and donations are readable by their owner and written only by the
-- service role. A client that could insert a succeeded payment row would have
-- granted itself a membership.
create policy payments_select_self on public.payments
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

create policy donations_select_self on public.donations
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

-- No policies at all on stripe_webhook_events: service role only, by design.
