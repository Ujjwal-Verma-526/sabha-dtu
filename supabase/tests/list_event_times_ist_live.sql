-- Run in the live SQL editor. Read-only: it changes nothing.
--
-- Lists every event's times so you can spot ones shifted by the timezone bug
-- fixed in fix/ist-event-times. Before that fix, the event form's times were
-- read in the server's timezone. Vercel runs in UTC, so an event typed as
-- 18:00 on the live site was stored as 18:00 UTC, which is 23:30 IST
-- (5 h 30 min late). Events saved from a dev server on an IST machine were
-- stored correctly, so the data alone can't say which events are wrong.
--
-- For each event, compare with what the organisers meant:
--   *_ist                  the real time, which every page shows after the fix
--   *_typed_if_shifted     what was typed into the form, IF it was saved on
--                          the live site before the fix
-- If *_typed_if_shifted is the intended time, the event is shifted. Open it in
-- the admin edit form (it now shows and saves IST) and re-enter the right
-- times. Shifted registration deadlines also closed registration 5 h 30 min
-- late.
select
  c.name as club,
  e.title,
  e.status,
  to_char(e.start_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as start_ist,
  to_char(e.start_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as start_typed_if_shifted,
  to_char(e.end_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as end_ist,
  to_char(e.end_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as end_typed_if_shifted,
  to_char(e.registration_deadline at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as deadline_ist,
  to_char(e.registration_deadline at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as deadline_typed_if_shifted,
  to_char(e.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as created_ist,
  (select count(*) from public.event_registrations r where r.event_id = e.id) as registrations,
  e.id
from public.events e
join public.clubs c on c.id = e.club_id
order by e.start_at desc;
