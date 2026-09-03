-- ---------------------------------------------------------------------------
-- 0008 · Remove the five invented startups.
--
-- The companion to 20260814000000, which cleared the invented testimonials,
-- press mentions and board. The `startups` table was missed in that pass and
-- kept serving the same class of claim from the Community tab, where each row
-- renders as "<stage> · Founded at the Dojo <year>" and four of the five carry
-- a "Hiring" chip:
--
--   Ferrite     Series A     2020   hiring
--   Palletron   Seed         2018   hiring
--   Openbench   Grant-funded 2021
--   Torchlight  Seed         2022   hiring
--   Rowline     Pre-seed     2024   hiring
--
-- None of these companies exist. "Founded at the Dojo" is a factual claim about
-- a real 501(c)(3)'s history, and the Hiring chip advertises open roles at
-- organisations that cannot have any.
--
-- Pebble is deliberately NOT touched. It was genuinely built at the Dojo and
-- the Kickstarter is public record — it is the one row of the six that the
-- Dojo can stand behind, and it is named here only to be excluded.
--
-- Nothing is inserted to replace them. Staff can add real alumni through the
-- startup management screen added by 20260813000200.
-- ---------------------------------------------------------------------------

-- Matched on `name`, which is unique (`startups_name_key`) and is also what the
-- slug was derived from. `delete` is naturally idempotent, so re-running this
-- against an already-clean database removes nothing and raises nothing — which
-- matters because 20260814000000 was applied out of band on at least one
-- instance, and this one may be too.
--
-- No cascade concerns: nothing in the schema carries a foreign key to
-- `startups`. 20260813000200 deliberately left the table unlinked to profiles
-- ("a startup is editorial content about the space, not member data"), so these
-- rows own no dependents.
delete from public.startups
 where name in ('Ferrite', 'Palletron', 'Openbench', 'Torchlight', 'Rowline');

-- A guard rather than a comment: if a later edit ever adds 'Pebble' to the list
-- above, the reset fails loudly here instead of quietly dropping the one real
-- entry. Skipped on a database that never had Pebble seeded, so this cannot
-- break an environment that legitimately has no startups at all.
do $$
begin
  if exists (select 1 from public.startups) then
    if not exists (select 1 from public.startups where name = 'Pebble') then
      raise exception
        'Refusing to leave startups without Pebble — this migration must only remove invented rows.';
    end if;
  end if;
end $$;
