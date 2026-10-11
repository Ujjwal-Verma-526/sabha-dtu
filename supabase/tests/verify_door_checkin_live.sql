-- Run in the live SQL editor AFTER pasting supabase/live/20260830000001_door_checkin.sql.
-- Read-only. Every row should say ok = true. The last row is informational.
--
-- This replaces verify_registration_tickets_live.sql for live checks: that
-- file's exact trigger list doesn't include this migration's two guards, so
-- its triggers row reads false from now on. Everything else it checks is
-- re-checked here.
with checks(check_name, ok, detail) as (
  -- columns, type, constraint, index
  select 'event_registrations.checked_in_by: uuid, references users, on delete set null',
         exists (
           select 1 from pg_constraint c
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
           where c.conrelid = 'public.event_registrations'::regclass
             and c.contype = 'f' and a.attname = 'checked_in_by'
             and c.confrelid = 'public.users'::regclass and c.confdeltype = 'n'
         )
         and (select format_type(atttypid, atttypmod) from pg_attribute
                where attrelid = 'public.event_registrations'::regclass and attname = 'checked_in_by') = 'uuid',
         ''
  union all
  select 'event_registrations.check_in_method uses enum check_in_method (scan, manual)',
         (select format_type(atttypid, atttypmod) from pg_attribute
            where attrelid = 'public.event_registrations'::regclass and attname = 'check_in_method') = 'check_in_method'
         and (select array_agg(enumlabel::text order by enumsortorder) from pg_enum
                where enumtypid = to_regtype('public.check_in_method')) = array['scan', 'manual'],
         ''
  union all
  select 'CHECK event_registrations_check_in_fields exists',
         exists (select 1 from pg_constraint
                 where conrelid = 'public.event_registrations'::regclass
                   and conname = 'event_registrations_check_in_fields' and contype = 'c'),
         coalesce((select pg_get_constraintdef(oid) from pg_constraint
                   where conrelid = 'public.event_registrations'::regclass
                     and conname = 'event_registrations_check_in_fields'), 'missing')
  union all
  select 'index event_registrations_checked_in_by_idx exists',
         to_regclass('public.event_registrations_checked_in_by_idx') is not null,
         ''
  -- triggers
  union all
  select 'event_registrations triggers (exact list)',
         (select array_agg(tgname::text order by tgname) from pg_trigger
            where tgrelid = 'public.event_registrations'::regclass and not tgisinternal)
           = array['event_registrations_enforce_rules',
                   'event_registrations_generate_ticket_code',
                   'event_registrations_guard_check_in',
                   'event_registrations_guard_checked_in_delete',
                   'event_registrations_issue_ticket',
                   'event_registrations_prevent_ticket_code_change'],
         (select string_agg(tgname::text, ', ' order by tgname) from pg_trigger
            where tgrelid = 'public.event_registrations'::regclass and not tgisinternal)
  union all
  select 'guard_check_in fires BEFORE INSERT OR UPDATE; delete guard BEFORE DELETE',
         exists (select 1 from pg_trigger
                 where tgrelid = 'public.event_registrations'::regclass
                   and tgname = 'event_registrations_guard_check_in'
                   and pg_get_triggerdef(oid) like '%BEFORE INSERT OR UPDATE ON public.event_registrations FOR EACH ROW%')
         and exists (select 1 from pg_trigger
                 where tgrelid = 'public.event_registrations'::regclass
                   and tgname = 'event_registrations_guard_checked_in_delete'
                   and pg_get_triggerdef(oid) like '%BEFORE DELETE ON public.event_registrations FOR EACH ROW%'),
         ''
  -- policies unchanged
  union all
  select 'event_registrations policies unchanged',
         (select array_agg(policyname::text order by policyname) from pg_policies
            where schemaname = 'public' and tablename = 'event_registrations')
           = array['event_registrations_delete_self_or_manager',
                   'event_registrations_insert_self',
                   'event_registrations_select_self_or_manager',
                   'event_registrations_update_manager'],
         ''
  union all
  select 'registration_tickets: only policy is select_own',
         (select array_agg(policyname || ':' || cmd order by policyname) from pg_policies
            where schemaname = 'public' and tablename = 'registration_tickets')
           = array['registration_tickets_select_own:SELECT'],
         ''
  union all
  select 'registration_tickets: anon nothing, authenticated SELECT only',
         not (has_table_privilege('anon', 'public.registration_tickets', 'select')
              or has_table_privilege('anon', 'public.registration_tickets', 'insert')
              or has_table_privilege('anon', 'public.registration_tickets', 'update')
              or has_table_privilege('anon', 'public.registration_tickets', 'delete'))
         and has_table_privilege('authenticated', 'public.registration_tickets', 'select')
         and not (has_table_privilege('authenticated', 'public.registration_tickets', 'insert')
                  or has_table_privilege('authenticated', 'public.registration_tickets', 'update')
                  or has_table_privilege('authenticated', 'public.registration_tickets', 'delete')),
         ''
  -- functions
  union all
  select 'RPCs + delete guard: security definer, search_path pinned to ''''',
         (select count(*) from pg_proc
            where oid in (to_regprocedure('public.check_in_by_token(uuid,text)'),
                          to_regprocedure('public.manual_check_in(uuid)'),
                          to_regprocedure('public.undo_check_in(uuid)'),
                          to_regprocedure('public.get_event_check_in_list(uuid)'),
                          to_regprocedure('public.guard_checked_in_registration_delete()'))
              and prosecdef and proconfig @> array['search_path=""']) = 5,
         ''
  union all
  select 'check_in_gate + check-in guard: invoker, search_path pinned to ''''',
         (select count(*) from pg_proc
            where oid in (to_regprocedure('public.check_in_gate(uuid,uuid)'),
                          to_regprocedure('public.guard_registration_check_in()'))
              and not prosecdef and proconfig @> array['search_path=""']) = 2,
         ''
  union all
  select 'RPCs: anon cannot execute, authenticated can, no PUBLIC grant',
         (select bool_and(not has_function_privilege('anon', f, 'execute')
                          and has_function_privilege('authenticated', f, 'execute')
                          and not exists (select 1 from aclexplode((select proacl from pg_proc where oid = f)) a
                                          where a.grantee = 0))
          from unnest(array[to_regprocedure('public.check_in_by_token(uuid,text)'),
                            to_regprocedure('public.manual_check_in(uuid)'),
                            to_regprocedure('public.undo_check_in(uuid)'),
                            to_regprocedure('public.get_event_check_in_list(uuid)')]) f)
         is true,
         ''
  union all
  select 'check_in_gate: no API role can execute it',
         not has_function_privilege('anon', 'public.check_in_gate(uuid,uuid)', 'execute')
         and not has_function_privilege('authenticated', 'public.check_in_gate(uuid,uuid)', 'execute')
         and (select proacl is not null from pg_proc where oid = to_regprocedure('public.check_in_gate(uuid,uuid)'))
         and not exists (select 1 from aclexplode((select proacl from pg_proc
                           where oid = to_regprocedure('public.check_in_gate(uuid,uuid)'))) a
                         where a.grantee = 0),
         ''
  union all
  select 'no token, ticket_code, email, user_id or roll number in any RPC result',
         (select bool_and(pg_get_function_result(f) !~* '(token|ticket_code|email|user_id|roll)')
          from unnest(array[to_regprocedure('public.check_in_by_token(uuid,text)'),
                            to_regprocedure('public.manual_check_in(uuid)'),
                            to_regprocedure('public.undo_check_in(uuid)'),
                            to_regprocedure('public.get_event_check_in_list(uuid)')]) f)
         is true,
         ''
  union all
  select 'get_my_registrations still present, no token in its result',
         coalesce((select pg_get_function_result(oid) not ilike '%token%' from pg_proc
                   where oid = to_regprocedure('public.get_my_registrations()')), false),
         ''
  -- data
  union all
  select 'every registration still has exactly one ticket',
         (select count(*) from public.event_registrations r
            where not exists (select 1 from public.registration_tickets t where t.registration_id = r.id)) = 0,
         (select count(*) from public.event_registrations)::text || ' registrations'
  union all
  select 'info: check-ins from before this migration (no method recorded)',
         true,
         (select count(*) from public.event_registrations
            where checked_in_at is not null and check_in_method is null)::text || ' rows'
)
select ok, check_name, detail from checks;
