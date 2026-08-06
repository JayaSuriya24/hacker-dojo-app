-- ============================================================================
-- 0005 · Storage buckets, their access policies, and the read models the app
--        actually queries.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Buckets
--
-- `avatars` is public-read because member cards render in the directory and a
-- signed URL per card would mean N round trips per screen. Everything else is
-- private and reached through a short-lived signed URL minted by the API.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',   'avatars',   true,  2 * 1024 * 1024,  array['image/jpeg', 'image/png', 'image/webp']),
  ('events',    'events',    true,  5 * 1024 * 1024,  array['image/jpeg', 'image/png', 'image/webp']),
  ('resources', 'resources', true,  5 * 1024 * 1024,  array['image/jpeg', 'image/png', 'image/webp']),
  ('documents', 'documents', false, 20 * 1024 * 1024, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Convention enforced by policy: the first path segment is the owner's UUID,
-- e.g. `avatars/<profile_id>/portrait.webp`. That single rule is what stops a
-- member from overwriting somebody else's avatar.
create policy "avatars are world readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy "members write their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "members update their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "members delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "event and resource art is world readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id in ('events', 'resources'));

create policy "staff manage event and resource art"
  on storage.objects for all to authenticated
  using (bucket_id in ('events', 'resources') and public.is_staff())
  with check (bucket_id in ('events', 'resources') and public.is_staff());

-- Verification documents (student ID, DD-214). Private; a member can upload
-- and read their own, staff can read all, nobody else sees anything.
create policy "members read their own documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

create policy "members upload their own documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Read models
--
-- These exist so the client asks one question and gets one answer. Views
-- inherit RLS from their base tables when declared with security_invoker.
-- ---------------------------------------------------------------------------

create view public.event_feed
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
  (e.starts_at::date = current_date)       as is_today
from public.events e
left join public.event_stats s on s.event_id = e.id
where e.status = 'published';

comment on view public.event_feed is
  'The events list exactly as the Events tab renders it: capacity maths already done.';

create view public.resource_availability
with (security_invoker = true)
as
select
  r.id,
  r.slug,
  r.kind,
  r.name,
  r.model,
  r.seats,
  r.amenities,
  r.status,
  r.requires_cert,
  r.min_duration_minutes,
  r.max_duration_minutes,
  r.opens_at,
  r.closes_at,
  r.image_path,
  z.name as zone_name,
  -- Next moment the resource is free: now, or the end of the booking currently
  -- covering now.
  coalesce(
    (
      select max(b.ends_at)
      from public.bookings b
      where b.resource_id = r.id
        and b.status = 'confirmed'
        and b.slot @> now()
    ),
    now()
  ) as free_from
from public.resources r
left join public.zones z on z.id = r.zone_id
where r.active;

create view public.member_directory
with (security_invoker = true)
as
select
  p.id,
  p.full_name,
  p.initials,
  p.avatar_path,
  p.bio,
  p.company,
  p.current_project,
  p.skills,
  p.member_since,
  z.name as zone_name,
  (s.id is not null) as is_here
from public.profiles p
left join public.sessions s
  on s.profile_id = p.id and s.ended_at is null and s.expires_at > now()
left join public.zones z on z.id = (
  select r.zone_id from public.resources r where r.id = s.resource_id
)
where p.directory_visible;

comment on view public.member_directory is
  'Who is on the floor plus the full member list. RLS on profiles still applies: guests see nothing here.';

-- Live occupancy, derived from the most recent sample per zone.
create view public.current_occupancy
with (security_invoker = true)
as
select
  z.id   as zone_id,
  z.name as zone_name,
  z.capacity,
  coalesce(latest.head_count, 0) as head_count
from public.zones z
left join lateral (
  select o.head_count
  from public.occupancy_samples o
  where o.zone_id = z.id
  order by o.recorded_at desc
  limit 1
) latest on true;
