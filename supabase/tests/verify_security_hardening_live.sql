-- Run in the live SQL editor AFTER pasting
-- supabase/live/20260902000001_security_hardening.sql.
-- Read-only: one SELECT (the SQL editor only shows the last statement's
-- result, so everything is in one). Every row should say ok = true. The last
-- row is informational.
--
-- Refusals (a coordinator removing an admin, anon probing is_super_admin, a
-- bad URL) can't be exercised without writing or switching roles, so this
-- checks the installed definitions; the behaviour is covered by
-- supabase/tests/security_hardening_roles.sql on the local stack.
with con as (
  select c.conname, c.convalidated, c.contype, pg_get_constraintdef(c.oid) as def
  from pg_constraint c
  where c.conrelid in ('public.clubs'::regclass, 'public.events'::regclass)
),
helper as (
  select p.proname, p.prosecdef, pg_get_userbyid(p.proowner) as owner, p.prosrc,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
  from pg_proc p
  where p.oid in ('public.is_super_admin(uuid)'::regprocedure,
                  'public.is_club_manager(uuid, uuid)'::regprocedure)
),
guard as (
  select p.prosecdef, pg_get_userbyid(p.proowner) as owner,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
  from pg_proc p
  where p.oid = to_regprocedure('public.guard_club_member_admin_changes()')
),
trg as (
  select t.tgenabled, t.tgtype, t.tgfoid
  from pg_trigger t
  where t.tgrelid = 'public.club_members'::regclass
    and t.tgname = 'club_members_guard_admin_changes'
),
banner_policies as (
  select policyname, cmd, roles
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'event_banners_%'
),
truncatable as (
  select c.relname
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    and (has_table_privilege('anon', c.oid, 'TRUNCATE')
         or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))
),
default_truncate as (
  select a.grantee::regrole::text as grantee
  from pg_default_acl d, aclexplode(d.defaclacl) a
  where d.defaclrole = 'postgres'::regrole
    and d.defaclnamespace = 'public'::regnamespace
    and d.defaclobjtype = 'r'
    and a.privilege_type = 'TRUNCATE'
    and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
),
url_rule(pattern) as (
  select '^(https://|http://(127\.0\.0\.1|localhost):54321/storage/v1/object/public/)'::text
),
checks(sort, check_name, ok, detail) as (
  -- 1. helpers answer only for the caller
  select 1, 'is_super_admin / is_club_manager answer only for auth.uid()',
         (select count(*) = 2
                 and bool_and(prosecdef and owner = 'postgres'
                              and prosrc like '%coalesce(uid = auth.uid(), false)%')
          from helper),
         (select string_agg(proname || ': ' || case when prosrc like '%auth.uid()%'
                                                    then 'checks auth.uid()' else 'OLD definition' end,
                            '; ' order by proname) from helper)
  union all
  select 2, 'helpers still executable by anon (the public read policies call them)',
         (select bool_and(anon_exec) from helper), ''
  -- 2. club_members guard
  union all
  select 3, 'guard_club_member_admin_changes: security definer, owned by postgres, no API EXECUTE',
         coalesce((select prosecdef and owner = 'postgres' and not anon_exec and not auth_exec
                   from guard), false),
         coalesce((select 'definer=' || prosecdef || ', owner=' || owner
                   from guard), 'missing')
  union all
  select 4, 'trigger club_members_guard_admin_changes: enabled, BEFORE INSERT/UPDATE/DELETE, per row',
         coalesce((select tgenabled = 'O' and (tgtype & 1) = 1 and (tgtype & 2) = 2
                          and (tgtype & 4) = 4 and (tgtype & 8) = 8 and (tgtype & 16) = 16
                          and tgfoid = to_regprocedure('public.guard_club_member_admin_changes()')
                   from trg), false),
         coalesce((select 'enabled=' || tgenabled::text || ', type=' || tgtype from trg), 'missing')
  union all
  select 5, 'club_members policies unchanged',
         (select array_agg(policyname::text order by policyname) from pg_policies
          where schemaname = 'public' and tablename = 'club_members')
         = array['club_members_delete_self_or_manager', 'club_members_insert_self_request_or_manager',
                 'club_members_select_self_or_manager', 'club_members_update_manager'],
         (select string_agg(policyname, ', ' order by policyname) from pg_policies
          where schemaname = 'public' and tablename = 'club_members')
  -- 3. CHECKs: present, validated, with the expected rule
  union all
  select 6, 'CHECK clubs_instagram_handle_format',
         coalesce((select contype = 'c' and convalidated
                          and def like '%^@?[A-Za-z0-9._]{1,30}$%'
                   from con where conname = 'clubs_instagram_handle_format'), false),
         coalesce((select def from con where conname = 'clubs_instagram_handle_format'), 'missing')
  union all
  select 7, 'CHECK clubs_logo_url_length: <= 500',
         coalesce((select contype = 'c' and convalidated and def like '%char_length(logo_url) <= 500%'
                   from con where conname = 'clubs_logo_url_length'), false),
         coalesce((select def from con where conname = 'clubs_logo_url_length'), 'missing')
  union all
  select 8, 'CHECK clubs_logo_url_https',
         coalesce((select contype = 'c' and convalidated and def like '%logo_url ~* %^(https://|%'
                   from con where conname = 'clubs_logo_url_https'), false),
         coalesce((select def from con where conname = 'clubs_logo_url_https'), 'missing')
  union all
  select 9, 'CHECK events_banner_url_length: <= 500',
         coalesce((select contype = 'c' and convalidated and def like '%char_length(banner_url) <= 500%'
                   from con where conname = 'events_banner_url_length'), false),
         coalesce((select def from con where conname = 'events_banner_url_length'), 'missing')
  union all
  select 10, 'CHECK events_banner_url_https',
         coalesce((select contype = 'c' and convalidated and def like '%banner_url ~* %^(https://|%'
                   from con where conname = 'events_banner_url_https'), false),
         coalesce((select def from con where conname = 'events_banner_url_https'), 'missing')
  union all
  select 11, 'every club and event satisfies the new checks',
         not exists (select 1 from public.clubs c, url_rule r
                     where c.instagram_handle !~ '^@?[A-Za-z0-9._]{1,30}$'
                        or char_length(c.logo_url) > 500 or c.logo_url !~* r.pattern)
         and not exists (select 1 from public.events e, url_rule r
                         where char_length(e.banner_url) > 500 or e.banner_url !~* r.pattern),
         ''
  -- 4. event-banners
  union all
  select 12, 'event-banners: public SELECT policy gone, managers-only SELECT for authenticated',
         not exists (select 1 from banner_policies where policyname = 'event_banners_select_public')
         and exists (select 1 from banner_policies
                     where policyname = 'event_banners_select_club_manager'
                       and cmd = 'SELECT' and roles = array['authenticated']::name[]),
         (select string_agg(policyname || ' ' || cmd || ' ' || array_to_string(roles, ','), '; '
                            order by policyname) from banner_policies)
  union all
  select 13, 'event-banners: insert/update/delete policies still there',
         (select count(*) = 3 from banner_policies
          where policyname in ('event_banners_insert_club_manager',
                               'event_banners_update_club_manager',
                               'event_banners_delete_club_manager')),
         ''
  union all
  select 14, 'event-banners bucket still public (image URLs keep working)',
         coalesce((select public from storage.buckets where id = 'event-banners'), false),
         ''
  -- 5. TRUNCATE
  union all
  select 15, 'no public table grants TRUNCATE to anon or authenticated',
         not exists (select 1 from truncatable),
         coalesce((select string_agg(relname, ', ' order by relname) from truncatable), '')
  union all
  select 16, 'default privileges for new tables (by postgres): no TRUNCATE for anon or authenticated',
         not exists (select 1 from default_truncate),
         coalesce((select string_agg(grantee, ', ') from default_truncate), '')
  union all
  select 17, 'anon can still SELECT clubs and events',
         has_table_privilege('anon', 'public.clubs', 'SELECT')
         and has_table_privilege('anon', 'public.events', 'SELECT'),
         ''
  -- informational
  union all
  select 18, 'informational: clubs without an approved admin (0 expected)',
         not exists (select 1 from public.clubs c
                     where not exists (select 1 from public.club_members m
                                       where m.club_id = c.id and m.role = 'admin'
                                         and m.status = 'approved')),
         (select count(*) || ' of ' || (select count(*) from public.clubs) || ' clubs'
          from public.clubs c
          where not exists (select 1 from public.club_members m
                            where m.club_id = c.id and m.role = 'admin' and m.status = 'approved'))
)
select check_name, ok, detail
from checks
order by sort;
