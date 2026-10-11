-- Run in the live SQL editor AFTER pasting
-- supabase/live/20260831000001_registration_closes_at_start.sql.
-- Read-only. Every row should say ok = true. The last two result sets are
-- informational.
--
-- The rule itself (registration refused from coalesce(deadline, start_at))
-- can't be exercised without inserting a registration, so this checks the
-- installed definitions instead; the behaviour is covered by
-- supabase/tests/registration_closes_at_start_roles.sql on the local stack.
with checks(check_name, ok, detail) as (
  select 'old CHECK events_deadline_before_start is gone',
         not exists (select 1 from pg_constraint
                     where conrelid = 'public.events'::regclass
                       and conname = 'events_deadline_before_start'),
         ''
  union all
  select 'CHECK events_deadline_before_end exists: registration_deadline <= end_at',
         exists (select 1 from pg_constraint
                 where conrelid = 'public.events'::regclass
                   and conname = 'events_deadline_before_end' and contype = 'c'
                   and pg_get_constraintdef(oid) ilike '%registration_deadline%<=%end_at%'),
         coalesce((select pg_get_constraintdef(oid) from pg_constraint
                   where conrelid = 'public.events'::regclass
                     and conname = 'events_deadline_before_end'), 'missing')
  union all
  select 'events_deadline_before_end is validated',
         coalesce((select convalidated from pg_constraint
                   where conrelid = 'public.events'::regclass
                     and conname = 'events_deadline_before_end'), false),
         ''
  union all
  select 'no event has a deadline after its end_at',
         not exists (select 1 from public.events
                     where registration_deadline is not null and registration_deadline > end_at),
         ''
  -- the guard function
  union all
  select 'enforce_registration_rules closes at coalesce(registration_deadline, start_at)',
         pg_get_functiondef('public.enforce_registration_rules()'::regprocedure)
           ilike '%now() >= coalesce(target_event.registration_deadline, target_event.start_at)%',
         ''
  union all
  select 'enforce_registration_rules no longer uses the old deadline message',
         pg_get_functiondef('public.enforce_registration_rules()'::regprocedure)
           not ilike '%deadline has passed%',
         ''
  union all
  select 'enforce_registration_rules keeps the event row lock and the capacity check',
         pg_get_functiondef('public.enforce_registration_rules()'::regprocedure) ilike '%for update%'
         and pg_get_functiondef('public.enforce_registration_rules()'::regprocedure) ilike '%event is at capacity%',
         ''
  union all
  select 'enforce_registration_rules is security definer with search_path = public',
         (select p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=public']
            from pg_proc p where p.oid = 'public.enforce_registration_rules()'::regprocedure),
         ''
  -- wiring
  union all
  select 'BEFORE INSERT trigger event_registrations_enforce_rules still calls it',
         exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.event_registrations'::regclass
                   and t.tgname = 'event_registrations_enforce_rules'
                   and t.tgfoid = 'public.enforce_registration_rules()'::regprocedure
                   and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and not t.tgisinternal),
         ''
  union all
  select 'no UPDATE or DELETE trigger runs the registration rules (existing registrations unaffected)',
         not exists (select 1 from pg_trigger t
                     where t.tgrelid = 'public.event_registrations'::regclass
                       and t.tgfoid = 'public.enforce_registration_rules()'::regprocedure
                       and ((t.tgtype & 8) = 8 or (t.tgtype & 16) = 16)),
         ''
)
select check_name, ok, detail from checks order by ok, check_name;

-- Informational: published events and when registration closes for each.
-- closes_at = the deadline if set, otherwise start_at. Times are IST.
select e.title,
       to_char(e.start_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as start_ist,
       to_char(e.end_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as end_ist,
       to_char(e.registration_deadline at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as deadline_ist,
       to_char(coalesce(e.registration_deadline, e.start_at) at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as closes_ist,
       case when now() >= coalesce(e.registration_deadline, e.start_at)
            then 'closed' else 'open' end as registration_now,
       case when e.start_at <= now() and now() < e.end_at then 'happening now' end as live_now
from public.events e
where e.status = 'published'
order by e.start_at desc;

-- Informational: registrations are untouched by this migration.
select count(*) as registrations_total,
       count(*) filter (where e.start_at <= now()) as for_events_already_started
from public.event_registrations r
join public.events e on e.id = r.event_id;
