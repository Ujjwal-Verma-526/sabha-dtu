-- Run in the live SQL editor AFTER pasting
-- supabase/live/20260831000001_registration_closes_at_start.sql.
-- Read-only: one SELECT (the SQL editor only shows the last statement's
-- result, so everything is in one). Every row should say ok = true. The last
-- row is informational.
--
-- The registration rule itself (refused from coalesce(deadline, start_at))
-- can't be exercised without inserting a registration, so this checks the
-- installed definitions; the behaviour is covered by
-- supabase/tests/registration_closes_at_start_roles.sql on the local stack.
with checks(sort, check_name, ok, detail) as (
  -- the effective-end function
  select 1, 'event_effective_end exists: immutable, invoker, search_path pinned',
         coalesce((select p.provolatile = 'i' and not p.prosecdef
                          and coalesce(p.proconfig, '{}') @> array['search_path=""']
                   from pg_proc p
                   where p.oid = to_regprocedure('public.event_effective_end(timestamptz,timestamptz)')), false),
         coalesce(to_regprocedure('public.event_effective_end(timestamptz,timestamptz)')::text, 'missing')
  union all
  select 2, 'event_effective_end: end_at when after start_at, else start_at + 4 h',
         public.event_effective_end('2026-01-01 10:00+00', '2026-01-01 12:00+00') = '2026-01-01 12:00+00'::timestamptz
         and public.event_effective_end('2026-01-01 10:00+00', '2026-01-01 10:00+00') = '2026-01-01 14:00+00'::timestamptz,
         ''
  union all
  select 3, 'event_effective_end: authenticated can execute (the CHECK runs as the writer), anon cannot',
         has_function_privilege('authenticated', 'public.event_effective_end(timestamptz,timestamptz)', 'execute')
         and not has_function_privilege('anon', 'public.event_effective_end(timestamptz,timestamptz)', 'execute'),
         ''
  -- the deadline constraint
  union all
  select 4, 'old CHECK events_deadline_before_start is gone',
         not exists (select 1 from pg_constraint
                     where conrelid = 'public.events'::regclass
                       and conname = 'events_deadline_before_start'),
         ''
  union all
  select 5, 'CHECK events_deadline_before_end: registration_deadline <= event_effective_end(start_at, end_at)',
         exists (select 1 from pg_constraint c
                 join pg_depend d on d.objid = c.oid
                 where c.conrelid = 'public.events'::regclass
                   and c.conname = 'events_deadline_before_end' and c.contype = 'c'
                   and d.refobjid = to_regprocedure('public.event_effective_end(timestamptz,timestamptz)')
                   and pg_get_constraintdef(c.oid) like '%registration_deadline <= %event_effective_end(start_at, end_at)%'),
         coalesce((select pg_get_constraintdef(oid) from pg_constraint
                   where conrelid = 'public.events'::regclass
                     and conname = 'events_deadline_before_end'), 'missing')
  union all
  select 6, 'events_deadline_before_end is validated',
         coalesce((select convalidated from pg_constraint
                   where conrelid = 'public.events'::regclass
                     and conname = 'events_deadline_before_end'), false),
         ''
  union all
  select 7, 'no event has a deadline after its effective end',
         not exists (select 1 from public.events
                     where registration_deadline > public.event_effective_end(start_at, end_at)),
         ''
  -- one rule: check_in_gate uses the function
  union all
  select 8, 'check_in_gate takes its effective end from event_effective_end (no inline copy)',
         pg_get_functiondef('public.check_in_gate(uuid,uuid)'::regprocedure)
           like '%public.event_effective_end(v_event.start_at, v_event.end_at)%'
         and pg_get_functiondef('public.check_in_gate(uuid,uuid)'::regprocedure)
           not like '%interval ''4 hours''%',
         ''
  union all
  select 9, 'check_in_gate is still not executable by any API role',
         not has_function_privilege('anon', 'public.check_in_gate(uuid,uuid)', 'execute')
         and not has_function_privilege('authenticated', 'public.check_in_gate(uuid,uuid)', 'execute'),
         ''
  -- the registration guard
  union all
  select 10, 'enforce_registration_rules closes at coalesce(registration_deadline, start_at)',
         pg_get_functiondef('public.enforce_registration_rules()'::regprocedure)
           ilike '%now() >= coalesce(target_event.registration_deadline, target_event.start_at)%',
         ''
  union all
  select 11, 'enforce_registration_rules no longer uses the old deadline message',
         pg_get_functiondef('public.enforce_registration_rules()'::regprocedure)
           not ilike '%deadline has passed%',
         ''
  union all
  select 12, 'enforce_registration_rules keeps the event row lock and the capacity check',
         pg_get_functiondef('public.enforce_registration_rules()'::regprocedure) ilike '%for update%'
         and pg_get_functiondef('public.enforce_registration_rules()'::regprocedure) ilike '%event is at capacity%',
         ''
  union all
  select 13, 'enforce_registration_rules is security definer with search_path = public',
         (select p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=public']
            from pg_proc p where p.oid = 'public.enforce_registration_rules()'::regprocedure),
         ''
  union all
  select 14, 'BEFORE INSERT trigger event_registrations_enforce_rules still calls it',
         exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.event_registrations'::regclass
                   and t.tgname = 'event_registrations_enforce_rules'
                   and t.tgfoid = 'public.enforce_registration_rules()'::regprocedure
                   and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and not t.tgisinternal),
         ''
  union all
  select 15, 'no UPDATE or DELETE trigger runs the registration rules (existing registrations unaffected)',
         not exists (select 1 from pg_trigger t
                     where t.tgrelid = 'public.event_registrations'::regclass
                       and t.tgfoid = 'public.enforce_registration_rules()'::regprocedure
                       and ((t.tgtype & 8) = 8 or (t.tgtype & 16) = 16)),
         ''
  -- informational
  union all
  select 99, 'info: published events and registrations right now',
         true,
         (select count(*) from public.events where status = 'published') || ' published; '
         || (select count(*) from public.events
              where status = 'published'
                and now() < coalesce(registration_deadline, start_at)) || ' open for registration; '
         || (select count(*) from public.events
              where status = 'published' and start_at <= now()
                and now() <= public.event_effective_end(start_at, end_at)) || ' happening now; '
         || (select count(*) from public.event_registrations) || ' registrations in total'
)
select check_name, ok, detail from checks order by sort;
