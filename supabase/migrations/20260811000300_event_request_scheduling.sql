-- ---------------------------------------------------------------------------
-- Approving a request produces an event.
--
-- Until now `event_requests` was a dead end: a member filled the form, a row
-- was stored, a steward could flip its status, and nothing ever reached the
-- calendar. Two things were missing — the request never captured *when* the
-- event runs (only a date, no time and no duration, so no `events` row could
-- be built from it), and it never captured whether it repeats.
-- ---------------------------------------------------------------------------

create type public.event_repeat_mode as enum ('once', 'weekly');

alter table public.event_requests
  -- The clock the host asked for. A date alone cannot become an event: both
  -- `starts_at` and `ends_at` are required and neither can be guessed.
  add column if not exists preferred_time  time not null default '18:00',
  add column if not exists duration_minutes integer not null default 120
    check (duration_minutes between 15 and 1440),

  add column if not exists repeat_mode public.event_repeat_mode not null default 'once',
  /** Postgres `dow`: 0 = Sunday … 6 = Saturday. Empty for a one-off. */
  add column if not exists repeat_weekdays smallint[] not null default '{}',
  add column if not exists repeat_interval_weeks integer not null default 1
    check (repeat_interval_weeks between 1 and 52),
  add column if not exists repeat_until date,

  -- What approval produced. Present so approving twice cannot put the same
  -- meetup on the calendar twice — the second attempt sees these and stops.
  add column if not exists created_event_id uuid
    references public.events (id) on delete set null,
  add column if not exists created_series_id uuid
    references public.event_series (id) on delete set null;

-- A weekly request has to say which days, or there is nothing to expand.
alter table public.event_requests
  add constraint event_requests_weekly_needs_days check (
    repeat_mode <> 'weekly'
    or (array_length(repeat_weekdays, 1) between 1 and 7
        and repeat_weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
  );

-- An end before the start would expand to nothing, silently.
alter table public.event_requests
  add constraint event_requests_repeat_until_after_date check (
    repeat_until is null or repeat_until >= preferred_date
  );

comment on column public.event_requests.repeat_mode is
  'once = a single event on preferred_date; weekly = an event_series on repeat_weekdays.';

notify pgrst, 'reload schema';
