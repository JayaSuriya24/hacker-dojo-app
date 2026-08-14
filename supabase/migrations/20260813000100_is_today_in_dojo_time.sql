-- ---------------------------------------------------------------------------
-- `is_today` was answering the question in the wrong timezone.
--
-- The old expression was:
--
--   (e.starts_at::date = current_date) as is_today
--
-- Both halves of that comparison resolve in the database session's timezone,
-- not the Dojo's. An 18:00 event in Mountain View is 01:00 UTC the NEXT day, so
-- every evening event — which for a hackerspace is most of them — was reported
-- as not happening today and vanished from "Today at the Dojo" on the home
-- screen. Verified before this change: a 6:00 PM and an 8:00 PM event today
-- both came back `isToday=false`, while noon and 3:00 PM came back true.
--
-- The fix is to ask the question in the same wall clock the members are
-- standing in. `dojo_timezone()` already exists and is documented as the single
-- source of truth for exactly this; the view simply was not using it.
--
-- `create or replace view` may only add columns at the end, never change or
-- reorder existing ones, so the whole select list is restated here unchanged
-- apart from the one expression.
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
  -- Both sides converted to the Dojo's wall clock before the date is taken.
  ((e.starts_at at time zone public.dojo_timezone())::date
     = (now() at time zone public.dojo_timezone())::date) as is_today,
  e.series_id,
  e.occurrence_date
from public.events e
left join public.event_stats s on s.event_id = e.id
where e.status = 'published';

notify pgrst, 'reload schema';
