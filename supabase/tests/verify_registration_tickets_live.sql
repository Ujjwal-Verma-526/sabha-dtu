-- Run in the live SQL editor AFTER applying the ticket migration.
-- Read-only. Every row should say ok = true.
with checks(check_name, ok, detail) as (
  -- table, RLS, policies
  select 'registration_tickets exists with RLS enabled',
         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.registration_tickets')), false),
         ''
  union all
  select 'only policy on registration_tickets is select_own',
         (select array_agg(policyname || ':' || cmd order by policyname) from pg_policies
            where schemaname = 'public' and tablename = 'registration_tickets')
           = array['registration_tickets_select_own:SELECT'],
         (select string_agg(policyname || ':' || cmd, ', ') from pg_policies
            where schemaname = 'public' and tablename = 'registration_tickets')
  -- privileges
  union all
  select 'anon has no privileges on registration_tickets',
         not (has_table_privilege('anon', 'public.registration_tickets', 'select')
              or has_table_privilege('anon', 'public.registration_tickets', 'insert')
              or has_table_privilege('anon', 'public.registration_tickets', 'update')
              or has_table_privilege('anon', 'public.registration_tickets', 'delete')),
         ''
  union all
  select 'authenticated: SELECT only on registration_tickets',
         has_table_privilege('authenticated', 'public.registration_tickets', 'select')
         and not (has_table_privilege('authenticated', 'public.registration_tickets', 'insert')
                  or has_table_privilege('authenticated', 'public.registration_tickets', 'update')
                  or has_table_privilege('authenticated', 'public.registration_tickets', 'delete')),
         ''
  -- triggers
  union all
  select 'event_registrations triggers',
         (select array_agg(tgname::text order by tgname) from pg_trigger
            where tgrelid = 'public.event_registrations'::regclass and not tgisinternal)
           = array['event_registrations_enforce_rules',
                   'event_registrations_generate_ticket_code',
                   'event_registrations_issue_ticket',
                   'event_registrations_prevent_ticket_code_change'],
         (select string_agg(tgname::text, ', ' order by tgname) from pg_trigger
            where tgrelid = 'public.event_registrations'::regclass and not tgisinternal)
  union all
  select 'registration_tickets immutability trigger',
         exists (select 1 from pg_trigger
                  where tgrelid = 'public.registration_tickets'::regclass
                    and tgname = 'registration_tickets_prevent_token_change'),
         ''
  -- get_my_registrations()
  union all
  select 'get_my_registrations: no args, security definer, search_path pinned',
         coalesce((select pronargs = 0 and prosecdef and proconfig @> array['search_path=""']
                   from pg_proc where oid = to_regprocedure('public.get_my_registrations()')), false),
         coalesce((select array_to_string(proconfig, ',') from pg_proc
                   where oid = to_regprocedure('public.get_my_registrations()')), 'missing')
  union all
  select 'get_my_registrations: no token in its result',
         coalesce((select pg_get_function_result(oid) not ilike '%token%' from pg_proc
                   where oid = to_regprocedure('public.get_my_registrations()')), false),
         ''
  union all
  select 'get_my_registrations: anon cannot execute, authenticated can',
         not has_function_privilege('anon', 'public.get_my_registrations()', 'execute')
         and has_function_privilege('authenticated', 'public.get_my_registrations()', 'execute'),
         ''
  union all
  select 'issue_registration_ticket is security definer with pinned search_path',
         coalesce((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
                   where oid = to_regprocedure('public.issue_registration_ticket()')), false),
         ''
  -- data
  union all
  select 'backfill: every registration has exactly one ticket',
         (select count(*) from public.event_registrations r
            where not exists (select 1 from public.registration_tickets t where t.registration_id = r.id)) = 0
         and (select count(*) from public.registration_tickets) = (select count(*) from public.event_registrations),
         (select count(*) from public.event_registrations)::text || ' registrations, '
           || (select count(*) from public.registration_tickets)::text || ' tickets'
  union all
  select 'all tokens are 32 uppercase hex and unique',
         (select count(*) from public.registration_tickets where token !~ '^[0-9A-F]{32}$') = 0
         and (select count(distinct token) from public.registration_tickets) = (select count(*) from public.registration_tickets),
         ''
  -- unchanged
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
  select 'guards migration present (get_event_registration_count)',
         to_regprocedure('public.get_event_registration_count(uuid)') is not null,
         ''
)
select ok, check_name, detail from checks;
