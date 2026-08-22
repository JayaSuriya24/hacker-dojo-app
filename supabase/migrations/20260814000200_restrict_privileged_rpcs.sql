-- ---------------------------------------------------------------------------
-- 0009 · Take the privileged RPCs back off the public internet.
--
-- 20260807000000 granted `all on all routines in schema public` to `anon`,
-- `authenticated` and `service_role`. That was the right instinct for TABLES —
-- RLS is the gate there, and the grant layer underneath it was refusing before
-- policies were ever consulted. It is the wrong instinct for FUNCTIONS, because
-- a `security definer` function runs as its owner and RLS is precisely what it
-- is designed to bypass. There is no second gate behind the grant.
--
-- PostgREST exposes every non-trigger function in `public` as
-- `POST /rest/v1/rpc/<name>`, so the combination meant an unauthenticated caller
-- holding nothing but the (public by design) anon key could append occupancy
-- samples forever, delete two weeks of history, materialise events onto the
-- Dojo's calendar, and mint a door credential for any profile id they cared to
-- name.
--
-- Postgres also grants EXECUTE on functions to PUBLIC by default, so revoking
-- from `anon` and `authenticated` alone would have left the same access
-- reachable through the implicit grant. Every statement below revokes from
-- PUBLIC first, and each names the full signature — `revoke` resolves by
-- argument types, and a bare name would fail on the overloadable ones.
--
-- ---------------------------------------------------------------------------
-- What was inspected, and what was decided for each
-- ---------------------------------------------------------------------------
--
-- SERVICE-ONLY — locked to `service_role` below. Every one of these is called
-- exclusively through `adminClient` in `server/src/repositories/**`, which
-- authenticates as `service_role`, so nothing a client does legitimately
-- reaches them:
--
--   sample_occupancy()                        staff.repository.ts   (scheduler)
--   prune_occupancy_samples()                 staff.repository.ts   (scheduler)
--   generate_event_occurrences(uuid,integer)  eventSeries.repository.ts
--   generate_all_event_occurrences(integer)   eventSeries.repository.ts
--   issue_door_credential(uuid)               NO CALLER — see below
--   generate_key_id()                         internal to issue_door_credential
--
-- INTENTIONALLY CALLABLE, AND DELIBERATELY LEFT ALONE. These are not an
-- oversight; revoking them would take the application down:
--
--   is_staff(), is_admin(), is_active_member()
--     Called from inside RLS policy expressions, which are evaluated as the
--     QUERYING role — so `authenticated` genuinely needs EXECUTE, and so does
--     `anon`, because `content_blocks_select_all` is `to anon, authenticated
--     using (active or public.is_staff())`. They take no arguments and report
--     only on `auth.uid()`, so an anonymous caller learns nothing but `false`.
--
--   dojo_timezone()
--     Not `security definer`, returns a constant, and is evaluated by the
--     `event_feed` view — which is `security_invoker`, so the anonymous reader
--     of the public events list executes it. Revoking it would blank the events
--     feed for everyone.
--
--   validate_booking(), handle_new_user(), enforce_event_capacity(),
--   sync_event_stats(), touch_updated_at()
--     Trigger functions. They return `trigger`, so PostgREST does not expose
--     them and Postgres refuses to call them outside a trigger context — there
--     is no RPC surface to close. Left untouched deliberately rather than
--     revoked for tidiness: they fire on ordinary member writes, and there is
--     no benefit here worth any risk to that path.
--
-- PARTIALLY RESTRICTED — see the block on `current_role_of` at the end.
--
-- Nothing is dropped. `issue_door_credential` and `generate_key_id` have no
-- caller left (physical access moved to Kisi), but a function with no caller is
-- a separate cleanup from a function with the wrong grants, and deleting code
-- to satisfy a security fix is how audit trails get lost.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Occupancy. `sample_occupancy` appends a row per zone on every call and
-- `prune_occupancy_samples` DELETES; both were anonymously reachable, which is
-- unbounded table growth and unauthenticated data destruction respectively.
-- ---------------------------------------------------------------------------
revoke execute on function public.sample_occupancy() from public, anon, authenticated;
grant  execute on function public.sample_occupancy() to service_role;

revoke execute on function public.prune_occupancy_samples() from public, anon, authenticated;
grant  execute on function public.prune_occupancy_samples() to service_role;

-- ---------------------------------------------------------------------------
-- Event generation. `events` deliberately has no client insert policy — what is
-- on the Dojo's calendar is the building's statement — and these functions are
-- the `security definer` back door around exactly that rule. Each call can
-- insert up to `max_occurrences` (default 1000) rows per active series.
-- ---------------------------------------------------------------------------
revoke execute on function public.generate_event_occurrences(uuid, integer)
  from public, anon, authenticated;
grant  execute on function public.generate_event_occurrences(uuid, integer) to service_role;

revoke execute on function public.generate_all_event_occurrences(integer)
  from public, anon, authenticated;
grant  execute on function public.generate_all_event_occurrences(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Door credentials. `door_credentials` has a select policy and NO write policy,
-- because issuing is the server's decision — and this `security definer`
-- function was the way around that for anyone with the anon key, for any
-- profile id. Dead code today, restricted anyway: dead code that can still be
-- invoked is live code.
-- ---------------------------------------------------------------------------
revoke execute on function public.issue_door_credential(uuid) from public, anon, authenticated;
grant  execute on function public.issue_door_credential(uuid) to service_role;

-- `generate_key_id` is `security invoker`, so it was never a privilege
-- escalation on its own. It is still an internal helper of the function above
-- with no client caller, and leaving it callable lets anyone burn through the
-- key-id space looking for collisions.
revoke execute on function public.generate_key_id() from public, anon, authenticated;
grant  execute on function public.generate_key_id() to service_role;

-- ---------------------------------------------------------------------------
-- `current_role_of(uuid)` — restricted for `anon`, NOT for `authenticated`.
--
-- This one cannot be fully closed here, and the reason is worth stating rather
-- than quietly working around.
--
-- It is `security definer` and takes an ARBITRARY uuid, so as an RPC it answers
-- "what role does this person hold" about anyone. That is the disclosure the
-- audit flagged.
--
-- But it is also called directly from an RLS policy:
--
--   profiles_update_self ... with check (id = auth.uid()
--                                        and role = public.current_role_of(auth.uid()))
--
-- Policy expressions are evaluated as the querying role, so revoking EXECUTE
-- from `authenticated` would make every profile edit fail with "permission
-- denied for function current_role_of". That is the check which stops a member
-- promoting themselves to admin, so it cannot simply be dropped either.
--
-- `anon` is revoked because no anon-facing policy references it, and the nested
-- calls from `is_staff()` / `is_admin()` run as the definer rather than as the
-- caller, so they are unaffected.
--
-- The residual exposure is therefore: any signed-in account can read any other
-- profile's role. Closing it properly means rewriting `profiles_update_self` so
-- the policy does not depend on a caller-executable function — an RLS change,
-- which is out of scope for this migration and is recorded as follow-up.
-- ---------------------------------------------------------------------------
revoke execute on function public.current_role_of(uuid) from public, anon;
grant  execute on function public.current_role_of(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Assert the result, rather than trusting that the statements above did what
-- they read as.
--
-- `revoke` resolves a function by its full signature and does NOT error when
-- the grant it removes was not there — so a mistyped argument list is a silent
-- no-op that leaves the endpoint open while the migration reports success.
-- That is the failure this guards: it fails the migration loudly instead.
--
-- The last two checks are the opposite guard. Over-revoking is just as much a
-- production incident as under-revoking — `is_staff()` is evaluated inside an
-- anon-facing policy and `dojo_timezone()` inside the public events view, so
-- losing either takes down surfaces that are meant to be reachable.
-- ---------------------------------------------------------------------------
do $$
declare
  locked constant text[] := array[
    'public.sample_occupancy()',
    'public.prune_occupancy_samples()',
    'public.generate_event_occurrences(uuid,integer)',
    'public.generate_all_event_occurrences(integer)',
    'public.issue_door_credential(uuid)',
    'public.generate_key_id()'
  ];
  target text;
begin
  foreach target in array locked loop
    if has_function_privilege('anon', target, 'EXECUTE') then
      raise exception 'anon can still execute % — the revoke did not take', target;
    end if;
    if has_function_privilege('authenticated', target, 'EXECUTE') then
      raise exception 'authenticated can still execute % — the revoke did not take', target;
    end if;
    if not has_function_privilege('service_role', target, 'EXECUTE') then
      raise exception 'service_role lost % — the API needs it', target;
    end if;
  end loop;

  -- `current_role_of` is the deliberate partial: closed to anon, retained for
  -- authenticated because `profiles_update_self` cannot be evaluated without it.
  --
  -- Both checks below are still correct AT THIS POINT IN THE CHAIN and must not
  -- be flipped — 20260822000000 is what removes the authenticated grant, and it
  -- runs after this file. That migration repoints the policy at the
  -- zero-argument `current_role_of_self()` first, which is what makes the
  -- revoke safe. The residual exposure described at the top of this file is
  -- closed there, not here.
  if has_function_privilege('anon', 'public.current_role_of(uuid)', 'EXECUTE') then
    raise exception 'anon can still execute current_role_of';
  end if;
  if not has_function_privilege('authenticated', 'public.current_role_of(uuid)', 'EXECUTE') then
    raise exception 'authenticated lost current_role_of — profile updates would fail';
  end if;

  -- Load-bearing for RLS. If these ever go, the app goes with them.
  if not has_function_privilege('anon', 'public.is_staff()', 'EXECUTE') then
    raise exception 'anon lost is_staff — content_blocks_select_all would fail';
  end if;
  if not has_function_privilege('anon', 'public.dojo_timezone()', 'EXECUTE') then
    raise exception 'anon lost dojo_timezone — the public events feed would fail';
  end if;
end
$$;

-- PostgREST caches privileges alongside the schema and will keep serving the
-- old answer — including still accepting these calls — until told otherwise.
notify pgrst, 'reload schema';
