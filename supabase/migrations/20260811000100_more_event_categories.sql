-- ---------------------------------------------------------------------------
-- Widen the event taxonomy.
--
-- Four categories meant most of the calendar landed in 'Community' by default,
-- which made the filter on the Events tab close to useless: the bucket everyone
-- falls into is not a filter, it is a synonym for "all".
--
-- `ADD VALUE` is one-way. Postgres has no `DROP VALUE`, and removing one means
-- recreating the type and rewriting every column that references it — so this
-- list was agreed before it was written rather than grown a value at a time.
--
-- Safe inside the migration's transaction on PG12+: a new label may be added in
-- a transaction as long as it is not USED in the same one, and nothing here
-- inserts a row. `IF NOT EXISTS` keeps the migration re-runnable.
-- ---------------------------------------------------------------------------

alter type public.event_category add value if not exists 'Workshops';
alter type public.event_category add value if not exists 'Talks';
alter type public.event_category add value if not exists 'Meetups';
alter type public.event_category add value if not exists 'Social';
alter type public.event_category add value if not exists 'Startups';
alter type public.event_category add value if not exists 'Robotics';
alter type public.event_category add value if not exists 'Security';
alter type public.event_category add value if not exists 'Open House';

notify pgrst, 'reload schema';
