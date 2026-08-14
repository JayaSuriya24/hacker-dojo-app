-- ---------------------------------------------------------------------------
-- Wi-Fi: two networks instead of one.
--
-- The Dojo runs a guest network anyone may join with a posted password, and a
-- member network where each member authenticates as themselves — their email
-- address as the username, a five-digit PIN as the password.
--
-- That replaces the single shared `wifi_password`. A shared secret handed to
-- every member cannot be rotated without telling everyone, and cannot tell you
-- who was on the network; a per-member credential can do both.
-- ---------------------------------------------------------------------------

create table public.wifi_credentials (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  -- Stored readable, deliberately. The member is shown this on the Wi-Fi card
  -- so that losing the welcome email is not a support ticket, which a hash
  -- cannot serve. It is protected by RLS rather than by digest: the row is
  -- readable only by the member it belongs to, and only ever written by the
  -- service role.
  pin         text not null check (pin ~ '^[0-9]{5}$'),
  issued_at   timestamptz not null default now(),
  rotated_at  timestamptz
);

comment on table public.wifi_credentials is
  'One member wireless credential per profile. Username is the profile email; this is the PIN.';

alter table public.wifi_credentials enable row level security;

-- A member reads their own credential and nothing else. There is deliberately
-- no insert or update policy: issuing a PIN is the server''s decision, made
-- when the Stripe webhook grants the membership, so the service role is the
-- only writer. Staff are excluded from select too — a steward has no reason to
-- read someone''s network password, and door credentials already tell them who
-- has access.
create policy wifi_credentials_select_self on public.wifi_credentials
  for select to authenticated
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Settings: the guest network becomes public, the shared member password goes.
-- ---------------------------------------------------------------------------

-- `wifi_ssid` keeps its key and becomes the member network specifically.
update public.site_settings
   set description = 'Member wireless network name (authenticate with email + PIN)'
 where key = 'wifi_ssid';

insert into public.site_settings (key, value, description, members_only) values
  ('wifi_guest_ssid',     'Hacker Dojo Free Wifi',
   'Open guest wireless network name', false),
  ('wifi_guest_password', 'hackerdojo',
   'Guest wireless password — posted publicly in the space, not a secret', false)
on conflict (key) do nothing;

-- The shared member password has no meaning now that each member has their own.
-- Left behind it would keep working, which is the problem: a credential nobody
-- rotates and everybody knows.
delete from public.site_settings where key = 'wifi_password';

notify pgrst, 'reload schema';
