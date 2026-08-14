-- ---------------------------------------------------------------------------
-- 0007 · Table privileges for the PostgREST roles.
-- ---------------------------------------------------------------------------
--
-- Every table so far was created without a single `grant`, on the assumption
-- that Supabase's default privileges would cover them. They do — but only for
-- objects created by the `postgres` role.
--
-- `supabase db push` connects as a temporary login role it provisions itself
-- ("Initialising login role..."), and `alter default privileges` is scoped to
-- the role that created the object. So a schema applied through the CLI ends up
-- with 33 tables that `anon`, `authenticated` and `service_role` cannot touch,
-- and every request through PostgREST answers:
--
--   42501: permission denied for table plans
--
-- which reads like an RLS denial and is not one. RLS denies by returning no
-- rows; this is the grant layer underneath it refusing before RLS is consulted.
--
-- Granting broadly here is deliberate and is the posture the policies were
-- written against — RLS is the gate, not the grant. Every one of the 33 tables
-- has row level security enabled, so a role reaching a table still gets only
-- what its policies allow. Narrowing the grants instead would silently break
-- the surfaces that are meant to be reachable without an account (tour
-- requests, the public event list) and would leave the policies describing
-- access that can no longer happen.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- The three statements above cover what exists right now. These cover what the
-- next migration creates, so this file does not have to be re-run by hand every
-- time a table is added. Scoped to the role executing this migration, which is
-- the same role that will apply the next one.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;

-- PostgREST caches the schema, including privileges, and serves a stale 42501
-- (or a "not found in the schema cache" 404) until told otherwise. DDL normally
-- triggers this via an event trigger; a bare `grant` does not always.
notify pgrst, 'reload schema';
