-- ============================================================================
-- 0002 · Identity and membership
--
-- `profiles` mirrors `auth.users` 1:1 and is the row every other table
-- references. Supabase's `auth.users` is not directly readable by clients, so
-- the public-facing identity has to live here.
-- ============================================================================

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             citext not null,
  full_name         text not null check (length(btrim(full_name)) between 2 and 120),
  initials          text generated always as (
                      upper(
                        substr(split_part(btrim(full_name), ' ', 1), 1, 1) ||
                        coalesce(nullif(substr(split_part(btrim(full_name), ' ', 2), 1, 1), ''), '')
                      )
                    ) stored,
  avatar_path       text,
  role              public.member_role not null default 'guest',
  bio               text check (bio is null or length(bio) <= 600),
  company           text check (company is null or length(company) <= 120),
  current_project   text check (current_project is null or length(current_project) <= 300),
  skills            text[] not null default '{}'::text[] check (array_length(skills, 1) is null or array_length(skills, 1) <= 8),
  phone             text check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  directory_visible boolean not null default true,
  member_since      date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.profiles.directory_visible is
  'When false the member is hidden from the community directory. Enforced in RLS, not just in the query.';

-- Directory search hits name/company/skills; a trigram index keeps the
-- "Name, skill, or company" field responsive as the directory grows.
create index profiles_search_idx on public.profiles
  using gin ((full_name || ' ' || coalesce(company, '')) gin_trgm_ops);
create index profiles_skills_idx on public.profiles using gin (skills);
create index profiles_role_idx on public.profiles (role);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Every new auth user gets a profile in the same transaction as the signup.
-- Doing this in a trigger rather than in the API means a profile can never be
-- missing, even if the client crashes between signup and its first request.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, member_since)
  values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    current_date
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Plans and memberships
-- ---------------------------------------------------------------------------

create table public.plans (
  id                  text primary key,
  name                text not null unique,
  description         text not null,
  price_monthly_cents integer not null check (price_monthly_cents >= 0),
  price_annual_cents  integer check (price_annual_cents >= 0),
  stripe_price_monthly text,
  stripe_price_annual  text,
  is_addon            boolean not null default false,
  is_popular          boolean not null default false,
  requires_proof      boolean not null default false,
  sort_order          integer not null default 0,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();

create table public.memberships (
  id                     uuid primary key default gen_random_uuid(),
  profile_id             uuid not null references public.profiles (id) on delete cascade,
  plan_id                text not null references public.plans (id),
  status                 public.membership_status not null default 'none',
  period                 public.billing_period not null default 'month',
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- One live membership per person. Add-ons (dedicated desk) are separate rows
  -- in `membership_addons`, not competing memberships.
  constraint memberships_one_active_per_profile
    exclude (profile_id with =) where (status in ('active', 'trialing', 'past_due'))
);

create index memberships_profile_idx on public.memberships (profile_id);
create index memberships_status_idx on public.memberships (status) where status in ('active', 'trialing');

create trigger memberships_touch before update on public.memberships
  for each row execute function public.touch_updated_at();

create table public.membership_addons (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  plan_id       text not null references public.plans (id),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (membership_id, plan_id)
);

-- ---------------------------------------------------------------------------
-- Notification preferences — one row per profile, created on demand.
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  profile_id        uuid primary key references public.profiles (id) on delete cascade,
  events            boolean not null default true,
  bookings          boolean not null default true,
  weekly_digest     boolean not null default false,
  push_token        text,
  push_token_at     timestamptz,
  updated_at        timestamptz not null default now()
);

create trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles                enable row level security;
alter table public.plans                   enable row level security;
alter table public.memberships             enable row level security;
alter table public.membership_addons       enable row level security;
alter table public.notification_preferences enable row level security;

-- Profiles: you always see yourself. You see other members only if you are an
-- active member yourself and they have not hidden their card. Staff see all.
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_directory on public.profiles
  for select to authenticated
  using (directory_visible and public.is_active_member());

create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (public.is_staff());

-- A member may edit their own card but may NOT promote themselves: the role
-- column is pinned to its current value for non-admins.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role_of(auth.uid()));

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Plans are public marketing data — readable by anyone, writable by nobody
-- except the service role (which bypasses RLS entirely).
create policy plans_select_all on public.plans
  for select to anon, authenticated
  using (active);

create policy memberships_select_self on public.memberships
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

-- Note: there is deliberately no INSERT/UPDATE policy on memberships for
-- clients. Membership state is a consequence of a Stripe webhook, and only the
-- service role writes it. A client that could set status='active' would be a
-- free membership.

create policy membership_addons_select_self on public.membership_addons
  for select to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.id = membership_id and (m.profile_id = auth.uid() or public.is_staff())
    )
  );

create policy notification_preferences_all_self on public.notification_preferences
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
