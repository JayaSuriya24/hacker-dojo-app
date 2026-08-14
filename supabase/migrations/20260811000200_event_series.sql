-- ---------------------------------------------------------------------------
-- Recurring events.
--
-- A weekly meetup was six unrelated rows someone remembered to add, or it did
-- not appear at all. This gives the pattern a home: one `event_series` row
-- carrying the rule and the template, and one ordinary `events` row per date.
--
-- Occurrences are REAL ROWS rather than dates computed on read, because every
-- guarantee around an event already hangs off `events.id` — `event_rsvps`
-- references it, `enforce_event_capacity` counts by it, `event_stats`
-- aggregates by it. Each Tuesday needs its own attendee list and its own
-- capacity, so each Tuesday needs its own row. Computing them on read would
-- mean reinventing RSVP identity and moving capacity out of the database,
-- which is the one place this codebase insists on keeping it.
-- ---------------------------------------------------------------------------

create type public.series_status as enum ('active', 'paused', 'ended');

create table public.event_series (
  id            uuid primary key default gen_random_uuid(),

  -- The template every occurrence is stamped from. Deliberately a copy of the
  -- event columns rather than a join: editing the series should change future
  -- occurrences, not silently rewrite the history of ones already attended.
  slug_prefix   text not null unique
                check (slug_prefix ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         text not null check (length(btrim(title)) between 3 and 160),
  description   text,
  category      public.event_category not null,
  host_profile_id uuid references public.profiles (id) on delete set null,
  host_name     text not null,
  resource_id   uuid references public.resources (id) on delete set null,
  room_name     text not null,
  capacity      integer not null check (capacity > 0),
  cover_path    text,
  members_only  boolean not null default false,

  -- The rule. Weekly with an interval and a weekday set, which is what a
  -- recurring meetup actually is; anything richer was deferred rather than
  -- half-built.
  interval_weeks   integer not null default 1 check (interval_weeks between 1 and 52),
  /** Postgres `dow`: 0 = Sunday … 6 = Saturday. At least one, no duplicates. */
  weekdays         smallint[] not null
                   check (
                     array_length(weekdays, 1) between 1 and 7
                     and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
                   ),

  /**
   * Local wall-clock start, plus the zone it is stated in.
   *
   * Stored as a time and a zone rather than as a timestamptz offset because
   * "6:30 PM every Tuesday" must stay 6:30 PM across a DST boundary. Each
   * occurrence's absolute instant is computed per date at generation, so the
   * March and November transitions produce the right answer without anyone
   * re-entering the series.
   */
  starts_time      time not null,
  duration_minutes integer not null check (duration_minutes between 15 and 1440),
  timezone         text not null default 'America/Los_Angeles',

  starts_on        date not null,
  /** Open-ended when both are null. `until_date` wins if both are set. */
  until_date       date,
  max_occurrences  integer check (max_occurrences > 0),

  status        public.series_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint event_series_until_after_start check (until_date is null or until_date >= starts_on)
);

create trigger event_series_touch before update on public.event_series
  for each row execute function public.touch_updated_at();

comment on table public.event_series is
  'The rule behind a recurring event. Occurrences are generated into `events`.';

-- ---------------------------------------------------------------------------
-- Occurrences hang off the series.
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists series_id uuid references public.event_series (id) on delete set null,
  add column if not exists occurrence_date date;

-- Generation's idempotency, and the reason it can be re-run on a timer without
-- producing a second copy of next Tuesday.
create unique index if not exists events_series_occurrence_idx
  on public.events (series_id, occurrence_date)
  where series_id is not null;

create index if not exists events_series_idx
  on public.events (series_id, starts_at) where series_id is not null;

-- ---------------------------------------------------------------------------
-- Generation.
--
-- Service role only, by design: an occurrence is the building's schedule, not
-- something a member may add rows to. Cancelling a single date is an ordinary
-- status update on that one row — `event_feed` already filters to `published`,
-- so a cancelled Tuesday leaves the feed and its siblings are untouched.
-- ---------------------------------------------------------------------------

create or replace function public.generate_event_occurrences(
  p_series_id uuid,
  p_horizon_days integer default 120
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s           public.event_series%rowtype;
  horizon_end date;
  made        integer := 0;
begin
  select * into s from public.event_series where id = p_series_id;
  if not found or s.status <> 'active' then
    return 0;
  end if;

  -- Never generate past the rule's own end, and never further than the horizon
  -- — an open-ended weekly series would otherwise fill the table to infinity.
  horizon_end := least(coalesce(s.until_date, current_date + p_horizon_days),
                       current_date + p_horizon_days);

  if horizon_end < s.starts_on then
    return 0;
  end if;

  with candidate as (
    select (week_start::date + offset_days) as occurrence_day
    from generate_series(
           date_trunc('week', s.starts_on::timestamp),
           horizon_end::timestamp,
           make_interval(weeks => s.interval_weeks)
         ) as week_start
    cross join unnest(s.weekdays) as wd
    -- `date_trunc('week')` lands on Monday; `dow` counts from Sunday. This maps
    -- one onto the other so Sunday belongs to the week it ends, not the next.
    cross join lateral (select ((wd + 6) % 7)::integer as offset_days) as o
  ),
  eligible as (
    select occurrence_day
    from candidate
    where occurrence_day >= s.starts_on
      and occurrence_day <= horizon_end
    order by occurrence_day
    limit coalesce(s.max_occurrences, 1000)
  )
  insert into public.events (
    series_id, occurrence_date, slug, title, description, category, status,
    host_profile_id, host_name, resource_id, room_name,
    starts_at, ends_at, capacity, cover_path, members_only
  )
  select
    s.id,
    e.occurrence_day,
    s.slug_prefix || '-' || to_char(e.occurrence_day, 'YYYY-MM-DD'),
    s.title, s.description, s.category, 'published',
    s.host_profile_id, s.host_name, s.resource_id, s.room_name,
    ((e.occurrence_day + s.starts_time) at time zone s.timezone),
    ((e.occurrence_day + s.starts_time) at time zone s.timezone)
      + make_interval(mins => s.duration_minutes),
    s.capacity, s.cover_path, s.members_only
  from eligible e
  on conflict (series_id, occurrence_date) where series_id is not null do nothing;

  get diagnostics made = row_count;
  return made;
end;
$$;

comment on function public.generate_event_occurrences is
  'Materialise a series'' occurrences up to a horizon. Idempotent; safe on a timer.';

/** Top every active series up. What the scheduler calls once an hour. */
create or replace function public.generate_all_event_occurrences(
  p_horizon_days integer default 120
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  total integer := 0;
  row_id uuid;
begin
  for row_id in select id from public.event_series where status = 'active' loop
    total := total + public.generate_event_occurrences(row_id, p_horizon_days);
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security.
-- ---------------------------------------------------------------------------

alter table public.event_series enable row level security;

-- The rule behind a published event is as public as the event: the app renders
-- "every week on Tuesday" to anyone who can see the occurrence. Writes are
-- staff-only, like the events themselves.
create policy event_series_select_all on public.event_series
  for select to anon, authenticated using (true);

create policy event_series_write_staff on public.event_series
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- The feed carries the series id so a detail view can find the sibling dates.
--
-- Appended rather than woven in: `create or replace view` may only add columns
-- at the end, and the existing order is what every reader already expects.
-- ---------------------------------------------------------------------------

create or replace view public.event_feed
with (security_invoker = true)
as
select
  e.id,
  e.slug,
  e.title,
  e.description,
  e.category,
  e.host_name,
  e.room_name,
  e.starts_at,
  e.ends_at,
  e.capacity,
  e.cover_path,
  e.members_only,
  coalesce(s.going_count, 0)    as going_count,
  coalesce(s.waitlist_count, 0) as waitlist_count,
  coalesce(s.going_count, 0) >= e.capacity as at_capacity,
  (e.starts_at::date = current_date)       as is_today,
  e.series_id,
  e.occurrence_date
from public.events e
left join public.event_stats s on s.event_id = e.id
where e.status = 'published';

notify pgrst, 'reload schema';
