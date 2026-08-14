-- ---------------------------------------------------------------------------
-- Startups: from a seeded showcase to a managed list.
--
-- The table was written to be read. It has no slug, no field constraints beyond
-- `name unique`, and no write policy of any kind — every row arrived through
-- `seed.sql`. Turning it into something staff can edit needs three things, and
-- deliberately nothing more:
--
--   1. A slug, so a startup can be addressed by a stable, readable key rather
--      than a uuid. Backfilled from the existing names.
--   2. Constraints that match what the API will validate, so a bad row cannot
--      be written by any route — including one that forgets to validate.
--   3. Write policies for staff. The repositories use the service role and so
--      bypass RLS entirely; these exist as the second line, for anything that
--      reaches the table with a member's own token.
--
-- What is NOT added, on purpose: any link between a startup and a profile. A
-- startup is editorial content about the space, not member data, and giving it
-- an owner would change who is allowed to see and edit it.
-- ---------------------------------------------------------------------------

-- 1. Slug ------------------------------------------------------------------

alter table public.startups add column if not exists slug text;

-- Backfill before the not-null: lowercase, non-alphanumerics collapsed to a
-- single hyphen, trimmed. "The New Thing!" -> "the-new-thing".
update public.startups
   set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
 where slug is null;

alter table public.startups alter column slug set not null;

-- `name` was already unique; the slug is the addressable form of it.
create unique index if not exists startups_slug_key on public.startups (slug);

-- 2. Field constraints -----------------------------------------------------
--
-- Mirrors the Zod schema in `server/src/validators`. Stated in both places on
-- purpose: the schema gives the member a field-level error, the constraint
-- makes the bad state unrepresentable regardless of which caller wrote it.

alter table public.startups
  drop constraint if exists startups_name_len,
  drop constraint if exists startups_mark_len,
  drop constraint if exists startups_tagline_len,
  drop constraint if exists startups_stage_len,
  drop constraint if exists startups_founded_year_shape,
  drop constraint if exists startups_website_shape,
  drop constraint if exists startups_sort_order_positive;

alter table public.startups
  add constraint startups_name_len
    check (length(btrim(name)) between 1 and 80),
  -- The monogram in the card tile. Two or three characters is what the 42pt
  -- tile fits; four is the generous ceiling before it starts to clip.
  add constraint startups_mark_len
    check (length(btrim(mark)) between 1 and 4),
  add constraint startups_tagline_len
    check (length(btrim(tagline)) between 1 and 200),
  add constraint startups_stage_len
    check (length(btrim(stage)) between 1 and 40),
  -- Text rather than an integer because that is how the column already is, and
  -- changing it would rewrite six existing rows for no gain. Four digits.
  add constraint startups_founded_year_shape
    check (founded_year ~ '^[0-9]{4}$'),
  -- Null is allowed — most of the seeded rows have none. A present value must
  -- be an absolute http(s) URL, so the app can hand it straight to the browser
  -- without guessing a scheme.
  add constraint startups_website_shape
    check (website is null or website ~* '^https?://[^[:space:]]+$'),
  add constraint startups_sort_order_positive
    check (sort_order >= 0);

-- 3. Ordering index --------------------------------------------------------
--
-- Every read is `order by sort_order`. Six rows do not need it; a list staff
-- can now grow does.
create index if not exists startups_sort_order_idx on public.startups (sort_order);

-- 4. Write policies --------------------------------------------------------
--
-- Read stays exactly as it was: `startups_select_all`, anon and authenticated,
-- `using (true)`. This is a public, editorial list and that does not change.
drop policy if exists startups_insert_staff on public.startups;
drop policy if exists startups_update_staff on public.startups;
drop policy if exists startups_delete_staff on public.startups;

create policy startups_insert_staff on public.startups
  for insert to authenticated with check (public.is_staff());

create policy startups_update_staff on public.startups
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy startups_delete_staff on public.startups
  for delete to authenticated using (public.is_staff());

notify pgrst, 'reload schema';
