-- ---------------------------------------------------------------------------
-- The host no longer states an attendee count.
--
-- It was a number the host had to invent before they had advertised anything,
-- and it only ever became the event's capacity — which the room already knows.
-- The column stays (the requests already recorded carry real answers, and a
-- steward may still want the hint) but it is no longer required from the form.
--
-- Approval prefers the room's own seat count and falls back to this.
-- ---------------------------------------------------------------------------

alter table public.event_requests
  alter column expected_size set default 30;

comment on column public.event_requests.expected_size is
  'Optional hint. Capacity comes from the room''s seats when the room is known.';

notify pgrst, 'reload schema';
