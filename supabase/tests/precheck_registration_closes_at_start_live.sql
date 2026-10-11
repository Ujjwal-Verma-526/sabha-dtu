-- Run in the live SQL editor BEFORE pasting
-- supabase/live/20260831000001_registration_closes_at_start.sql.
-- Read-only: one SELECT, changes nothing. Safe to run any number of times.
--
-- The first row (summary) says whether the migration can be pasted now.
-- Rows below it:
--   check      ok = true means fine
--   violation  an event whose registration_deadline is after its effective
--              end; the new CHECK events_deadline_before_end would reject it.
--              Fix it (edit the event's deadline or end time) before pasting.
--   info       an event whose end_at is null or not after start_at. Not a
--              problem: it counts as ending at start_at + 4 h, the same as
--              tickets and door check-in. Listed so you can review them.
--
-- The effective end is written out inline here because
-- public.event_effective_end doesn't exist until the migration runs. It must
-- match that function: end_at, or start_at + 4 hours when end_at isn't after
-- start_at (a null end_at also falls back to start_at + 4 hours).
with ev as (
  select e.id, e.title, e.slug, e.status, e.start_at, e.end_at, e.registration_deadline,
         case when e.end_at > e.start_at then e.end_at
              else e.start_at + interval '4 hours' end as effective_end
  from public.events e
),
violations as (
  select * from ev
  where registration_deadline is not null and registration_deadline > effective_end
),
no_separate_end as (
  select * from ev
  where end_at is null or end_at <= start_at
),
rows(sort, kind, ok, item, detail) as (
  select 0, 'summary',
         to_regprocedure('public.check_in_gate(uuid,uuid)') is not null
           and to_regprocedure('public.event_effective_end(timestamptz,timestamptz)') is null
           and not exists (select 1 from violations),
         'ready to paste supabase/live/20260831000001_registration_closes_at_start.sql',
         'true only if every check below is ok'
  union all
  select 1, 'check',
         to_regprocedure('public.check_in_gate(uuid,uuid)') is not null,
         'door check-in (20260830000001) is applied',
         'required first: this migration rewrites check_in_gate'
  union all
  select 1, 'check',
         to_regprocedure('public.event_effective_end(timestamptz,timestamptz)') is null
           and not exists (select 1 from pg_constraint
                           where conrelid = 'public.events'::regclass
                             and conname = 'events_deadline_before_end'),
         '20260831000001 is not applied yet',
         'false means it is already on live; run the verify query instead'
  union all
  select 1, 'check',
         not exists (select 1 from violations),
         'no event has a registration deadline after its effective end',
         (select count(*) from violations) || ' violating event(s)'
  union all
  select 1, 'check',
         not exists (select 1 from ev where end_at is null),
         'no event has a null end_at',
         (select count(*) from ev where end_at is null) || ' event(s); the schema says NOT NULL, so this should be 0'
  union all
  select 2, 'violation', false,
         v.title || ' (' || v.slug || ', ' || v.status || ')',
         'id ' || v.id
           || '; deadline ' || to_char(v.registration_deadline at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')
           || ' IST is after effective end ' || to_char(v.effective_end at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')
           || ' IST (start ' || to_char(v.start_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')
           || ', end ' || coalesce(to_char(v.end_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI'), 'null') || ')'
  from violations v
  union all
  select 3, 'info', true,
         n.title || ' (' || n.slug || ', ' || n.status || ')',
         'id ' || n.id
           || case when n.end_at is null then '; end_at is null'
                   else '; end_at = start_at ' || to_char(n.start_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST' end
           || '; counts as ending at ' || to_char(n.effective_end at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST'
  from no_separate_end n
)
select kind, ok, item, detail
from rows
order by sort, ok, item;
