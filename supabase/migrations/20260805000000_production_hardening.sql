-- ---------------------------------------------------------------------------
-- Production hardening.
--
-- Additive only: no table is dropped and no column changes type. Three classes
-- of change live here.
--
--   1. Correctness fixes for rules that were expressed in the wrong place —
--      the tours insert policy that did not exist, and the booking-hours check
--      that compared a timestamptz against a local `time` under whatever
--      timezone the connection happened to carry.
--   2. New surfaces the app needs end to end: door credentials and their audit
--      trail, verification documents, editable content, push delivery records.
--   3. Staff policies, so the rows members already create (tours, event
--      requests, applications) can actually be actioned by someone.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The Dojo's wall clock.
--
-- `resources.opens_at` / `closes_at` are `time` values, which only mean
-- something against a zone. Everything that compares a timestamptz to one of
-- them must agree on which zone, so the answer lives in one function rather
-- than being implied by the caller's connection setting.
-- ---------------------------------------------------------------------------
create or replace function public.dojo_timezone()
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select 'America/Los_Angeles'::text $$;

comment on function public.dojo_timezone is
  'The single source of truth for the Dojo wall clock. The API reads the same value.';

-- ---------------------------------------------------------------------------
-- Booking validation, corrected for timezone.
--
-- The previous body did `new.starts_at::time`, which casts under the session
-- TimeZone — UTC for PostgREST. A 09:00 opening hour then admitted a 09:00Z
-- booking, which is 02:00 in Mountain View. The cast now goes through the
-- Dojo's zone explicitly, so "opens at 9" means nine in the morning here.
-- ---------------------------------------------------------------------------
create or replace function public.validate_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r           public.resources%rowtype;
  minutes     integer;
  tz          text := public.dojo_timezone();
  local_start time;
  local_end   time;
  local_day   date;
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

  local_start := (new.starts_at at time zone tz)::time;
  local_end   := (new.ends_at   at time zone tz)::time;
  local_day   := (new.starts_at at time zone tz)::date;

  -- A reservation that crosses local midnight can never sit inside a single
  -- day's opening hours, and comparing its end time would silently pass.
  if (new.ends_at at time zone tz)::date <> local_day then
    raise exception 'Booking must start and end on the same day (% – %)', r.opens_at, r.closes_at
      using errcode = '23514';
  end if;

  if local_start < r.opens_at or local_end > r.closes_at then
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

-- ---------------------------------------------------------------------------
-- Tours: the missing insert policy.
--
-- `contentService.bookTour` runs as the caller when one is signed in, so with
-- only a select policy in place RLS refused every authenticated booking and the
-- member saw "You don't have access to that". Anonymous bookings came in
-- through the service role and worked, which is what hid it.
--
-- The check pins `profile_id` to the caller: a member may book their own tour
-- and nobody else's.
-- ---------------------------------------------------------------------------
create policy tours_insert_self on public.tours
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy tours_update_staff on public.tours
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy tours_select_staff on public.tours
  for select to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Sessions: members check themselves in and out.
--
-- Nothing wrote this table, so `member_directory.is_here` was always false and
-- the "Who's here" tab was permanently empty. Check-in is a member action, so
-- it is a policy rather than a service-role write — and the existing partial
-- unique index still allows only one live session per person.
-- ---------------------------------------------------------------------------
create policy sessions_insert_self on public.sessions
  for insert to authenticated
  with check (profile_id = auth.uid() and public.is_active_member());

-- Members on the floor are visible to other members: that is the directory's
-- whole purpose, and `member_directory` already gates on `directory_visible`.
create policy sessions_select_members on public.sessions
  for select to authenticated
  using (public.is_active_member() or profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Occupancy: sampled from live sessions.
--
-- `occupancy_samples` had no writer either, so the Home dial was frozen on
-- whatever the seed inserted. This function rolls live sessions up per zone and
-- appends one sample per zone; the API calls it on a timer, and pg_cron can
-- call it instead without changing anything above.
-- ---------------------------------------------------------------------------
create or replace function public.sample_occupancy()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted integer;
begin
  insert into public.occupancy_samples (zone_id, head_count)
  select
    z.id,
    (
      select count(*)
      from public.sessions s
      left join public.resources r on r.id = s.resource_id
      where s.ended_at is null
        and s.expires_at > now()
        and coalesce(r.zone_id, 'main') = z.id
    )
  from public.zones z;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

comment on function public.sample_occupancy is
  'Appends one occupancy sample per zone from live sessions. Called by the API scheduler.';

-- Samples age out; keeping every row forever turns a dial into a data-retention
-- problem. Two weeks is plenty for the trend the app draws.
create or replace function public.prune_occupancy_samples()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  delete from public.occupancy_samples where recorded_at < now() - interval '14 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Door credentials.
--
-- The app showed a key id that was a string literal in a component and an
-- "Access granted" animation that talked to nothing. A credential is a real row
-- now: issued per profile, revocable, and the thing the unlock endpoint checks.
-- ---------------------------------------------------------------------------
create table if not exists public.door_credentials (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null unique references public.profiles (id) on delete cascade,
  -- Human-readable on the card in the app, e.g. "A7-2291-MV". Unique so a
  -- steward reading one aloud identifies exactly one member.
  key_id      text not null unique,
  active      boolean not null default true,
  issued_at   timestamptz not null default now(),
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists door_credentials_active_idx
  on public.door_credentials (profile_id) where active;

create trigger door_credentials_touch before update on public.door_credentials
  for each row execute function public.touch_updated_at();

/**
 * Mint a key id.
 *
 * Shape is deliberate: two blocks a person can read over a phone plus the site
 * code, drawn from a crockford-ish alphabet with the ambiguous glyphs removed
 * so 0/O and 1/I cannot be misheard at the front desk.
 */
create or replace function public.generate_key_id()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
  attempt   integer := 0;
begin
  loop
    candidate :=
      substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1) ||
      lpad(floor(random() * 10)::text, 1, '0') || '-' ||
      lpad(floor(random() * 10000)::text, 4, '0') || '-MV';

    exit when not exists (select 1 from public.door_credentials where key_id = candidate);

    attempt := attempt + 1;
    if attempt > 50 then
      raise exception 'Could not mint a unique key id' using errcode = '23505';
    end if;
  end loop;

  return candidate;
end;
$$;

/**
 * Issue (or return) the caller's credential.
 *
 * `security definer` because a member may hold a credential but must not be
 * able to write the table directly — minting is the server's decision, gated on
 * an active membership, and the audit trail below records every use.
 */
create or replace function public.issue_door_credential(p_profile_id uuid)
returns public.door_credentials
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.door_credentials;
begin
  select * into existing
  from public.door_credentials
  where profile_id = p_profile_id;

  if existing.id is not null then
    if not existing.active then
      update public.door_credentials
        set active = true, revoked_at = null, issued_at = now()
        where id = existing.id
        returning * into existing;
    end if;
    return existing;
  end if;

  insert into public.door_credentials (profile_id, key_id)
  values (p_profile_id, public.generate_key_id())
  returning * into existing;

  return existing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Verification documents (student ID, DD-214) and avatars.
--
-- The `documents` storage bucket already existed with per-user folder policies;
-- what was missing was the row that tells a steward a file is waiting and what
-- it is meant to prove.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'document_kind') then
    create type public.document_kind as enum ('student_id', 'veteran_proof', 'certification', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'document_status') then
    create type public.document_status as enum ('submitted', 'approved', 'rejected');
  end if;
end
$$;

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  kind         public.document_kind not null,
  -- Path inside the private `documents` bucket. Never a URL: the object is read
  -- through a short-lived signed URL, minted per request.
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   integer not null check (size_bytes > 0),
  status       public.document_status not null default 'submitted',
  review_note  text,
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists documents_profile_idx on public.documents (profile_id, created_at desc);
create index if not exists documents_pending_idx on public.documents (created_at) where status = 'submitted';

create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Editable content.
--
-- The impact figures and the "what we stand for" pillars were literal arrays in
-- a service, so changing "6,400+ members served" meant a deploy. They are rows
-- now, keyed by a slot the client asks for by name.
-- ---------------------------------------------------------------------------
create table if not exists public.content_blocks (
  id         uuid primary key default gen_random_uuid(),
  -- The surface this belongs to: 'impact', 'pillars', 'home_quick_access', 'wifi'.
  slot       text not null,
  key        text not null,
  -- Rendered as the large figure or the pillar name.
  label      text not null,
  -- The supporting line. Null where a slot only carries a label.
  value      text,
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slot, key)
);

create index if not exists content_blocks_slot_idx on public.content_blocks (slot, sort_order) where active;

create trigger content_blocks_touch before update on public.content_blocks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Site settings — single-valued configuration a steward can edit.
--
-- The Wi-Fi SSID and password were compiled into the mobile bundle, which meant
-- rotating the password required an app release and left the old one readable
-- in every installed copy. They live here and are served only to members.
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key         text primary key,
  value       text not null,
  description text,
  -- When true the value is served only to callers with an active membership.
  members_only boolean not null default false,
  updated_at  timestamptz not null default now()
);

create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Push delivery log.
--
-- Expo's push API is at-least-once from our side too: a retried send would
-- double-notify. A delivery row per (profile, dedupe key) makes a repeat send a
-- cheap unique violation, exactly as the Stripe webhook guard does.
-- ---------------------------------------------------------------------------
create table if not exists public.push_deliveries (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  -- Stable per logical notification, e.g. 'booking-reminder:<booking id>'.
  dedupe_key   text not null,
  channel      text not null,
  title        text not null,
  body         text not null,
  ticket_id    text,
  status       text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error        text,
  created_at   timestamptz not null default now(),
  unique (profile_id, dedupe_key)
);

create index if not exists push_deliveries_recent_idx on public.push_deliveries (created_at desc);

-- ---------------------------------------------------------------------------
-- Stripe webhook events: claim, then confirm.
--
-- The table previously recorded "we have seen this id" — `processed_at` was NOT
-- NULL and defaulted to now(), so the row asserted success at the moment of
-- receipt. The service treated any second delivery as already handled, which
-- means that if the work after the claim threw, Stripe's retry was discarded
-- and a member could pay and never be activated.
--
-- Making the column nullable and dropping its default separates the two states:
-- a row with `processed_at is null` was claimed but not finished, and a retry of
-- it is processed rather than dropped.
-- ---------------------------------------------------------------------------
alter table public.stripe_webhook_events
  alter column processed_at drop not null,
  alter column processed_at drop default;

alter table public.stripe_webhook_events
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text;

-- Rows written before this migration really were processed; the default said so
-- and nothing recorded a failure. Backfill rather than leaving them ambiguous.
update public.stripe_webhook_events
  set processed_at = coalesce(processed_at, received_at)
  where processed_at is null;

create index if not exists stripe_webhook_unprocessed_idx
  on public.stripe_webhook_events (received_at) where processed_at is null;

-- ---------------------------------------------------------------------------
-- Row Level Security for the new tables.
-- ---------------------------------------------------------------------------
alter table public.door_credentials enable row level security;
alter table public.documents        enable row level security;
alter table public.content_blocks   enable row level security;
alter table public.site_settings    enable row level security;
alter table public.push_deliveries  enable row level security;

-- A member reads their own key and nothing else. Writes are service-role only:
-- issuing and revoking are the server's decisions.
create policy door_credentials_select_self on public.door_credentials
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

-- Members see and submit their own documents; stewards see all of them, because
-- reviewing them is the job.
create policy documents_select_self on public.documents
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

create policy documents_insert_self on public.documents
  for insert to authenticated
  with check (profile_id = auth.uid() and status = 'submitted');

-- A member may withdraw a document they submitted; only a steward may decide it.
create policy documents_delete_self on public.documents
  for delete to authenticated
  using (profile_id = auth.uid() and status = 'submitted');

create policy documents_update_staff on public.documents
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Content is public copy. Anyone may read it, only staff may change it.
create policy content_blocks_select_all on public.content_blocks
  for select to anon, authenticated using (active or public.is_staff());

create policy content_blocks_write_staff on public.content_blocks
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Settings split on `members_only`: the address is public, the Wi-Fi password
-- is not.
create policy site_settings_select_public on public.site_settings
  for select to anon, authenticated
  using (not members_only);

create policy site_settings_select_members on public.site_settings
  for select to authenticated
  using (members_only and (public.is_active_member() or public.is_staff()));

create policy site_settings_write_staff on public.site_settings
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Delivery records are an operational trail. A member may see what was sent to
-- them; nobody writes through RLS.
create policy push_deliveries_select_self on public.push_deliveries
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

-- Door access logs already had a self-select policy; stewards need the same
-- view to investigate a failed badge-in.
create policy door_logs_select_staff on public.door_access_logs
  for select to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Staff policies for rows members were already creating.
--
-- Tours, event requests and program applications all accepted inserts and were
-- then readable by nobody but their author, so nothing could be actioned.
-- ---------------------------------------------------------------------------
create policy event_requests_select_staff on public.event_requests
  for select to authenticated
  using (public.is_staff());

create policy event_requests_update_staff on public.event_requests
  for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy program_applications_select_staff on public.program_applications
  for select to authenticated
  using (public.is_staff());

create policy program_applications_update_staff on public.program_applications
  for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy certifications_manage_staff on public.certifications
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy events_manage_staff on public.events
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Storage: the `documents` bucket could be written but never replaced.
--
-- Upload and read policies existed; update and delete did not, so a member who
-- uploaded the wrong file was stuck with it and re-uploading under the same
-- name failed. Both are scoped by the same first-path-segment rule as avatars.
-- ---------------------------------------------------------------------------
create policy "members replace their own documents"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "members delete their own documents"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Read models for the new surfaces.
-- ---------------------------------------------------------------------------

-- The live session with the name of the thing it is holding. The card in the
-- app said "Phone Booth B" for every session because the endpoint returned the
-- bare row and the client had nothing else to print.
create view public.live_session_view
with (security_invoker = true)
as
select
  s.id,
  s.profile_id,
  s.resource_id,
  s.started_at,
  s.expires_at,
  s.ended_at,
  coalesce(r.name, 'The floor') as resource_name,
  r.kind                        as resource_kind,
  z.name                        as zone_name
from public.sessions s
left join public.resources r on r.id = s.resource_id
left join public.zones z     on z.id = r.zone_id
where s.ended_at is null;

comment on view public.live_session_view is
  'A live session plus the resource it holds, so the countdown card can name it.';

-- Everything a steward triages, in one shape, so the admin list is one query
-- rather than four with client-side interleaving.
create view public.staff_queue
with (security_invoker = true)
as
select
  'tour'::text                     as kind,
  t.id::text                       as id,
  coalesce(p.full_name, t.guest_name, 'Guest') as requester_name,
  coalesce(p.email::text, t.guest_email::text) as requester_email,
  t.status::text                   as status,
  to_char(t.scheduled_for, 'YYYY-MM-DD"T"HH24:MI:SSOF') as detail,
  'Tour'::text                     as summary,
  t.created_at
from public.tours t
left join public.profiles p on p.id = t.profile_id
union all
select
  'event_request',
  e.id::text,
  p.full_name,
  p.email::text,
  e.status::text,
  e.preferred_date::text,
  e.title,
  e.created_at
from public.event_requests e
join public.profiles p on p.id = e.profile_id
union all
select
  'program_application',
  a.id::text,
  p.full_name,
  p.email::text,
  a.status::text,
  t.program_id,
  t.name,
  a.created_at
from public.program_applications a
join public.profiles p       on p.id = a.profile_id
join public.program_tracks t on t.id = a.track_id
union all
select
  'document',
  d.id::text,
  p.full_name,
  p.email::text,
  d.status::text,
  d.kind::text,
  d.file_name,
  d.created_at
from public.documents d
join public.profiles p on p.id = d.profile_id;

comment on view public.staff_queue is
  'Everything awaiting a steward, in one shape. RLS on the base tables means a
   non-staff caller sees only their own rows through it.';

-- ---------------------------------------------------------------------------
-- Seed the content that used to be hardcoded in `content.service.ts`, so the
-- first deploy after this migration renders identically and every value is
-- editable from that moment on.
-- ---------------------------------------------------------------------------
insert into public.content_blocks (slot, key, label, value, sort_order) values
  ('impact', 'members',  '6,400+', 'Members served since 2009', 1),
  ('impact', 'events',   '1,180',  'Events hosted',             2),
  ('impact', 'startups', '42',     'Startups launched here',    3),
  ('impact', 'years',    '17',     'Years running',             4),
  ('pillars', 'access',     'Access',     'Tools and space for anyone who shows up', 1),
  ('pillars', 'community',  'Community',  'Neighbours who''ve made your mistakes',   2),
  ('pillars', 'potential',  'Potential',  'Talent before credentials',               3),
  ('pillars', 'build',      'Build',      'Finish the thing, then show it',          4),
  ('pillars', 'experiment', 'Experiment', 'Cheap failure, in public',                5),
  ('pillars', 'improve',    'Improve',    'Leave the bench better',                  6)
on conflict (slot, key) do nothing;

insert into public.site_settings (key, value, description, members_only) values
  ('wifi_ssid',     'dojo-5g',          'Guest and member wireless network name', false),
  ('wifi_password', 'make-things-2009', 'Member wireless password',               true),
  ('lab_hours',     'Open until 9 PM',  'Hardware lab staffed hours',             false),
  ('lab_status',    'Steward on floor', 'Hardware lab staffing note',             false)
on conflict (key) do nothing;
