-- ============================================================================
-- 0001 · Extensions, enums, and the helper functions every later migration
--        depends on.
--
-- Design rule for this schema: authorization lives in the database. RLS is
-- enabled on every table and there is no policy anywhere that lets a client
-- read or write another member's row. The API server holds the service-role
-- key and is the only actor allowed to bypass a policy — and it only does so
-- in the repository layer, never in a controller.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enumerated domains. Enums (not free text) so a bad value is a write error
-- rather than a rendering bug three screens later.
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('guest', 'member', 'steward', 'admin');
create type public.membership_status as enum ('none', 'trialing', 'active', 'past_due', 'canceled');
create type public.billing_period as enum ('month', 'year');
create type public.resource_kind as enum ('hardware', 'room');
create type public.resource_status as enum ('available', 'in_use', 'maintenance');
create type public.booking_status as enum ('confirmed', 'cancelled', 'completed', 'no_show');
create type public.rsvp_status as enum ('going', 'waitlisted', 'cancelled');
create type public.event_category as enum ('Hackathons', 'Hardware', 'AI/ML', 'Community');
create type public.event_status as enum ('draft', 'pending_review', 'published', 'cancelled');
create type public.application_status as enum ('submitted', 'in_review', 'accepted', 'rejected', 'withdrawn');
create type public.payment_status as enum ('requires_payment', 'processing', 'succeeded', 'failed', 'refunded');
create type public.tour_status as enum ('requested', 'confirmed', 'attended', 'cancelled');

-- ---------------------------------------------------------------------------
-- Helpers used inside RLS policies.
--
-- Every one of these is STABLE + SECURITY DEFINER with a pinned search_path.
-- SECURITY DEFINER matters: a policy on `profiles` that needs to read
-- `profiles` to decide the role would recurse forever under the caller's own
-- policies. Running as the definer with RLS bypassed breaks that cycle.
-- ---------------------------------------------------------------------------

create or replace function public.current_role_of(uid uuid)
returns public.member_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select p.role from public.profiles p where p.id = uid), 'guest'::public.member_role);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role_of(auth.uid()) in ('steward', 'admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role_of(auth.uid()) = 'admin';
$$;

-- An "active member" is the gate on every member benefit: door access,
-- bookings, the member directory. Guests authenticate fine; they just do not
-- pass this check, which is what makes the guest surfaces read-only.
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.memberships m
    where m.profile_id = auth.uid()
      and m.status in ('active', 'trialing')
      and (m.current_period_end is null or m.current_period_end > now())
  ) or public.is_staff();
$$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance. One trigger function, attached to every table that
-- carries the column, so "when did this last change" is never a lie.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.is_active_member is
  'True when the caller holds a membership in active/trialing state, or is staff. The gate for every member-only policy.';
