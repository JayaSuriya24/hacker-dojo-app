-- ============================================================================
-- 0003 · The physical space: zones, resources, bookings, sessions, occupancy.
--
-- The interesting constraint here is double-booking. Two members tapping
-- "Confirm reservation" on the same laser cutter at the same second must not
-- both succeed. Application-level "check then insert" loses that race, so the
-- guarantee is a GiST exclusion constraint over a tstzrange — the database
-- rejects the overlap regardless of how the requests interleave.
-- ============================================================================

create extension if not exists btree_gist;

create table public.zones (
  id         text primary key,
  name       text not null unique,
  capacity   integer not null check (capacity > 0),
  -- The occupancy dial on Home splits the headcount across zones by these
  -- weights when live sensor data is unavailable.
  weight     numeric(4, 3) not null default 0.25 check (weight > 0 and weight <= 1),
  sort_order integer not null default 0
);

create table public.resources (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  kind           public.resource_kind not null,
  name           text not null,
  model          text,
  zone_id        text references public.zones (id) on delete set null,
  seats          integer check (seats is null or seats > 0),
  amenities      text,
  status         public.resource_status not null default 'available',
  requires_cert  boolean not null default false,
  -- Booking rules, per resource, enforced server-side on every request.
  min_duration_minutes integer not null default 60 check (min_duration_minutes > 0),
  max_duration_minutes integer not null default 240 check (max_duration_minutes > 0),
  opens_at       time not null default '09:00',
  closes_at      time not null default '21:00',
  image_path     text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint resources_duration_sane check (max_duration_minutes >= min_duration_minutes),
  constraint resources_rooms_have_seats check (kind <> 'room' or seats is not null)
);

create index resources_kind_idx on public.resources (kind) where active;
create trigger resources_touch before update on public.resources
  for each row execute function public.touch_updated_at();

-- Certifications a member holds. A booking on a resource with
-- requires_cert = true is refused unless a matching row exists and is unexpired.
create table public.certifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  unique (profile_id, resource_id)
);

create index certifications_profile_idx on public.certifications (profile_id);

create table public.bookings (
  id          uuid primary key default gen_random_uuid(),
  reference   text not null unique default 'DJ-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 4)),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      public.booking_status not null default 'confirmed',
  notes       text check (notes is null or length(notes) <= 500),
  -- Generated, not passed in: the exclusion constraint needs a real range
  -- column and deriving it here means it can never disagree with the endpoints.
  slot        tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint bookings_ends_after_starts check (ends_at > starts_at),
  constraint bookings_max_span check (ends_at - starts_at <= interval '4 hours'),
  -- The double-booking guarantee. Cancelled bookings are excluded so a
  -- released slot is immediately re-bookable.
  constraint bookings_no_overlap
    exclude using gist (resource_id with =, slot with &&)
    where (status in ('confirmed', 'completed'))
);

create index bookings_profile_idx on public.bookings (profile_id, starts_at desc);
create index bookings_resource_window_idx on public.bookings using gist (resource_id, slot);
create index bookings_upcoming_idx on public.bookings (starts_at) where status = 'confirmed';

create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

-- Enforce the per-resource rules that a CHECK constraint cannot see, because
-- they depend on the referenced resource row.
create or replace function public.validate_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.resources%rowtype;
  minutes integer;
begin
  select * into r from public.resources where id = new.resource_id;

  if r.id is null or not r.active then
    raise exception 'Resource is not bookable' using errcode = '23514';
  end if;

  if r.status = 'maintenance' then
    raise exception 'Resource is under maintenance' using errcode = '23514';
  end if;

  minutes := extract(epoch from (new.ends_at - new.starts_at)) / 60;
  if minutes < r.min_duration_minutes or minutes > r.max_duration_minutes then
    raise exception 'Booking must be between % and % minutes', r.min_duration_minutes, r.max_duration_minutes
      using errcode = '23514';
  end if;

  if new.starts_at::time < r.opens_at or new.ends_at::time > r.closes_at then
    raise exception 'Booking falls outside opening hours (% – %)', r.opens_at, r.closes_at
      using errcode = '23514';
  end if;

  if r.requires_cert and not exists (
    select 1 from public.certifications c
    where c.profile_id = new.profile_id
      and c.resource_id = new.resource_id
      and (c.expires_at is null or c.expires_at > now())
  ) then
    raise exception 'Certification required for this resource' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger bookings_validate
  before insert or update of starts_at, ends_at, resource_id on public.bookings
  for each row execute function public.validate_booking();

-- ---------------------------------------------------------------------------
-- Live sessions (the phone-booth timer on Home) and occupancy samples.
-- ---------------------------------------------------------------------------
create table public.sessions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete set null,
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  ended_at    timestamptz,
  constraint sessions_expiry_after_start check (expires_at > started_at)
);

create unique index sessions_one_live_per_profile
  on public.sessions (profile_id) where ended_at is null;
create index sessions_resource_idx on public.sessions (resource_id) where ended_at is null;

create table public.occupancy_samples (
  id           bigint generated always as identity primary key,
  zone_id      text references public.zones (id) on delete cascade,
  head_count   integer not null check (head_count >= 0),
  recorded_at  timestamptz not null default now()
);

create index occupancy_recent_idx on public.occupancy_samples (recorded_at desc);

-- Door access is an audit trail, not app state: append-only, never updated,
-- never deleted by a client.
create table public.door_access_logs (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  key_id      text not null,
  granted     boolean not null,
  reason      text,
  device_hint text,
  created_at  timestamptz not null default now()
);

create index door_access_profile_idx on public.door_access_logs (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.zones             enable row level security;
alter table public.resources         enable row level security;
alter table public.certifications    enable row level security;
alter table public.bookings          enable row level security;
alter table public.sessions          enable row level security;
alter table public.occupancy_samples enable row level security;
alter table public.door_access_logs  enable row level security;

-- The space itself is public information — a prospective member browsing the
-- hardware list before joining is a conversion surface, not a leak.
create policy zones_select_all on public.zones
  for select to anon, authenticated using (true);

create policy resources_select_all on public.resources
  for select to anon, authenticated using (active);

create policy certifications_select_self on public.certifications
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

-- Bookings: yours are yours. Members can see that a slot is taken (needed to
-- render availability) but the API exposes only the time range for other
-- people's bookings — never who booked it.
create policy bookings_select_self on public.bookings
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

create policy bookings_insert_self on public.bookings
  for insert to authenticated
  with check (profile_id = auth.uid() and public.is_active_member());

create policy bookings_update_self on public.bookings
  for update to authenticated
  using (profile_id = auth.uid() and status = 'confirmed')
  with check (profile_id = auth.uid());

create policy bookings_staff_manage on public.bookings
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy sessions_select_self on public.sessions
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

create policy sessions_update_self on public.sessions
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy occupancy_select_all on public.occupancy_samples
  for select to anon, authenticated using (true);

-- Read-only, and only your own. Writes come from the door controller via the
-- service role; nothing a client sends could forge an entry.
create policy door_logs_select_self on public.door_access_logs
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());
