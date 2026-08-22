-- ---------------------------------------------------------------------------
-- Close the last caller-executable path to another member's role.
--
-- `profiles_update_self` is what stops a member promoting themselves: the
-- WITH CHECK pins `role` to its current value. To evaluate that, the policy
-- called `public.current_role_of(uid)` — and a policy's expressions run as the
-- CALLER, so `authenticated` had to keep EXECUTE on it.
--
-- That left the function reachable over PostgREST as an ordinary RPC:
--
--   POST /rest/v1/rpc/current_role_of  {"uid": "<any profile id>"}
--
-- Any signed-in account could ask for anybody's role and enumerate who the
-- admins are. `20260814000200_restrict_privileged_rpcs.sql` closed this to
-- `anon`, recorded the residual exposure in a comment, and left the fix as
-- follow-up because it needed an RLS change. This is that change.
--
-- The shape of the fix: a function that takes NO argument and reads only
-- `auth.uid()`. The policy needs exactly one value — the caller's own role —
-- and it never needed the ability to ask about anyone else. Taking the
-- parameter away removes the question rather than guarding the answer.
--
-- `auth.uid()` inside a SECURITY DEFINER function still returns the CALLER:
-- it reads the request's JWT claims out of a session GUC, and SECURITY DEFINER
-- changes the effective role, not the session settings.
-- ---------------------------------------------------------------------------

create or replace function public.current_role_of_self()
returns public.member_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    'guest'::public.member_role
  );
$$;

comment on function public.current_role_of_self() is
  'The calling member''s own role. Zero-argument on purpose: profiles_update_self '
  'needs only the caller''s role, and the uuid-taking current_role_of() let any '
  'signed-in account read anyone''s.';

-- Explicit rather than inherited. `alter default privileges` is scoped to the
-- role that creates the object, and 20260807000000 documents at length how that
-- silently fails to apply when the CLI provisions its own login role.
revoke execute on function public.current_role_of_self() from public;
grant  execute on function public.current_role_of_self() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Repoint the policy, then take the privilege away.
--
-- Order matters. Revoking first would leave a window in which the policy
-- references a function the caller may not execute, and every profile update
-- in that window fails with 42501 — at request time, not at migration time.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role_of_self());

-- The uuid form stays: `is_staff()` and `is_admin()` both call it, and those
-- calls are nested inside SECURITY DEFINER bodies, so they run as the definer
-- and are unaffected by what `authenticated` may execute directly.
revoke execute on function public.current_role_of(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Assert the end state, in the style of 20260814000200.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('authenticated', 'public.current_role_of(uuid)', 'EXECUTE') then
    raise exception 'authenticated can still execute current_role_of(uuid) — the revoke did not take';
  end if;
  if has_function_privilege('anon', 'public.current_role_of(uuid)', 'EXECUTE') then
    raise exception 'anon can still execute current_role_of(uuid)';
  end if;
  if not has_function_privilege('service_role', 'public.current_role_of(uuid)', 'EXECUTE') then
    raise exception 'service_role lost current_role_of(uuid)';
  end if;

  -- Load-bearing: profiles_update_self cannot be evaluated without this one.
  if not has_function_privilege('authenticated', 'public.current_role_of_self()', 'EXECUTE') then
    raise exception 'authenticated cannot execute current_role_of_self — profile updates would fail';
  end if;
end
$$;

notify pgrst, 'reload schema';
