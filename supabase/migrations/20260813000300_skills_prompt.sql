-- ---------------------------------------------------------------------------
-- Remember that we asked about skills.
--
-- The directory already searches and filters on `profiles.skills`, but nothing
-- ever asks a member to fill it in — so the column is empty for everyone who
-- did not go looking for the profile editor, and the skill chips filter a list
-- almost nobody appears in.
--
-- The onboarding prompt needs to run exactly once, which cannot be inferred
-- from the column itself: an empty `skills` is indistinguishable between "never
-- asked" and "asked, and they had nothing to add". Someone who skips would be
-- asked again on every launch.
--
-- Hence a timestamp rather than a boolean: it records WHEN we asked, which is
-- also what tells you whether a member predates the prompt.
--
-- Deliberately NOT on the client. "Have we asked this person" is a property of
-- the person, not of the phone in their hand — a local flag would ask again on
-- a second device and after every reinstall.
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists skills_prompted_at timestamptz;

comment on column public.profiles.skills_prompted_at is
  'When the member was asked to add their skills. Null means never asked; the onboarding prompt is shown exactly once, whether they answer or skip.';

notify pgrst, 'reload schema';
