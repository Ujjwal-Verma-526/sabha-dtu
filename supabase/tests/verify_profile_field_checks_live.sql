-- Run in the live SQL editor AFTER pasting
-- supabase/live/20260901000001_profile_field_checks.sql.
-- Read-only: one SELECT (the SQL editor only shows the last statement's
-- result, so everything is in one). Every row should say ok = true. The last
-- row is informational.
--
-- Rejecting a bad update or a bad sign-up can't be exercised without
-- writing, so this checks the installed definitions; the behaviour is
-- covered by supabase/tests/profile_field_checks_roles.sql on the local
-- stack.
with con as (
  select c.conname, c.convalidated, c.contype, pg_get_constraintdef(c.oid) as def
  from pg_constraint c
  where c.conrelid = 'public.users'::regclass
),
fn as (
  select pg_get_functiondef('public.handle_new_auth_user()'::regprocedure) as def
),
checks(sort, check_name, ok, detail) as (
  -- the constraints: present, validated, with the expected rule
  select 1, 'CHECK users_name_not_blank: btrim(name) <> ''''',
         coalesce((select contype = 'c' and convalidated and def like '%btrim(name) <> ''''%'
                   from con where conname = 'users_name_not_blank'), false),
         coalesce((select def from con where conname = 'users_name_not_blank'), 'missing')
  union all
  select 2, 'CHECK users_name_length: char_length(name) <= 100',
         coalesce((select contype = 'c' and convalidated and def like '%char_length(name) <= 100%'
                   from con where conname = 'users_name_length'), false),
         coalesce((select def from con where conname = 'users_name_length'), 'missing')
  union all
  select 3, 'CHECK users_roll_number_length: char_length(roll_number) <= 30',
         coalesce((select contype = 'c' and convalidated and def like '%char_length(roll_number) <= 30%'
                   from con where conname = 'users_roll_number_length'), false),
         coalesce((select def from con where conname = 'users_roll_number_length'), 'missing')
  union all
  select 4, 'CHECK users_branch_length: char_length(branch) <= 100',
         coalesce((select contype = 'c' and convalidated and def like '%char_length(branch) <= 100%'
                   from con where conname = 'users_branch_length'), false),
         coalesce((select def from con where conname = 'users_branch_length'), 'missing')
  union all
  select 5, 'CHECK users_avatar_url_length: char_length(avatar_url) <= 500',
         coalesce((select contype = 'c' and convalidated and def like '%char_length(avatar_url) <= 500%'
                   from con where conname = 'users_avatar_url_length'), false),
         coalesce((select def from con where conname = 'users_avatar_url_length'), 'missing')
  union all
  select 6, 'CHECK users_avatar_url_web: avatar_url ~* ''^https?://''',
         coalesce((select contype = 'c' and convalidated and def like '%avatar_url ~* ''^https?://''::text%'
                   from con where conname = 'users_avatar_url_web'), false),
         coalesce((select def from con where conname = 'users_avatar_url_web'), 'missing')
  union all
  select 7, 'users_batch_year_range is still there',
         exists (select 1 from con where conname = 'users_batch_year_range' and convalidated),
         ''
  union all
  select 8, 'every profile satisfies the new checks',
         not exists (select 1 from public.users u
                     where btrim(u.name) = '' or char_length(u.name) > 100
                        or char_length(u.roll_number) > 30 or char_length(u.branch) > 100
                        or char_length(u.avatar_url) > 500 or u.avatar_url !~* '^https?://'),
         ''
  -- the sign-up trigger
  union all
  select 9, 'handle_new_auth_user trims, skips blanks and caps the name at 100 characters',
         (select def from fn) like '%left(%'
         and (select def from fn) like '%nullif(btrim(new.raw_user_meta_data ->> ''full_name''), '''')%'
         and (select def from fn) like '%nullif(btrim(new.raw_user_meta_data ->> ''name''), '''')%'
         and (select def from fn) like '%''New user''%'
         and (select def from fn) like '%100%',
         ''
  union all
  select 10, 'handle_new_auth_user still never copies avatar_url',
         (select def from fn) not ilike '%avatar%' and (select def from fn) not ilike '%picture%',
         ''
  union all
  select 11, 'handle_new_auth_user is security definer, search_path = public, owned by postgres',
         (select p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=public']
                 and pg_get_userbyid(p.proowner) = 'postgres'
          from pg_proc p where p.oid = 'public.handle_new_auth_user()'::regprocedure),
         (select pg_get_userbyid(p.proowner) from pg_proc p
          where p.oid = 'public.handle_new_auth_user()'::regprocedure)
  union all
  select 12, 'AFTER INSERT trigger on_auth_user_created on auth.users still calls it',
         exists (select 1 from pg_trigger t
                 where t.tgrelid = 'auth.users'::regclass
                   and t.tgname = 'on_auth_user_created'
                   and t.tgfoid = 'public.handle_new_auth_user()'::regprocedure
                   and (t.tgtype & 2) = 0 and (t.tgtype & 4) = 4
                   and t.tgenabled <> 'D'),
         ''
  -- nothing about access changed
  union all
  select 13, 'RLS is still enabled on public.users',
         (select relrowsecurity from pg_class where oid = 'public.users'::regclass),
         ''
  union all
  select 14, 'public.users policies are still exactly users_select_own_or_super_admin, users_update_own, users_update_super_admin',
         (select array_agg(policyname::text order by policyname) from pg_policies
          where schemaname = 'public' and tablename = 'users')
           = array['users_select_own_or_super_admin', 'users_update_own', 'users_update_super_admin'],
         (select string_agg(policyname || ' (' || cmd || ')', ', ' order by policyname) from pg_policies
          where schemaname = 'public' and tablename = 'users')
  union all
  select 15, 'users_prevent_privilege_escalation trigger is still there',
         exists (select 1 from pg_trigger
                 where tgrelid = 'public.users'::regclass
                   and tgname = 'users_prevent_privilege_escalation'
                   and tgenabled <> 'D'),
         ''
  -- informational
  union all
  select 99, 'info: profiles right now',
         true,
         (select count(*) from public.users) || ' profiles; '
         || (select count(*) from public.users where avatar_url is not null) || ' with an avatar_url; '
         || 'longest name ' || coalesce((select max(char_length(name)) from public.users), 0) || ' characters'
)
select check_name, ok, detail from checks order by sort;
