-- Run in the live SQL editor AFTER pasting
-- supabase/live/20260905000001_avatar_storage.sql.
-- Read-only: one SELECT. Every row should say ok = true; the last one is
-- informational.
--
-- Uploads and refusals can't be exercised without writing, so this checks
-- the installed bucket, policies and helper; the behaviour is covered by
-- supabase/tests/avatar_storage_roles.sql on the local stack.
with bucket as (
  select public, file_size_limit, allowed_mime_types
  from storage.buckets where id = 'avatars'
),
pol as (
  select policyname, cmd, roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars\_%'
),
fn as (
  select p.oid, p.prosecdef, p.prosrc
  from pg_proc p where p.oid = to_regprocedure('public.is_own_avatar_path(text)')
)
select 1 as sort, 'avatars bucket exists and is public' as check_name,
       coalesce((select public from bucket), false) as ok
union all
select 2, 'bucket: 5 MB, JPEG/PNG/WebP (same as event-banners)',
       coalesce((select file_size_limit = 5242880
                        and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
                 from bucket), false)
union all
select 3, 'exactly four avatars policies: select, insert, update, delete, authenticated only',
       coalesce((select array_agg(policyname::text || ':' || cmd || ':' || array_to_string(roles, ',')
                                  order by policyname) from pol)
                = array['avatars_delete_own:DELETE:authenticated',
                        'avatars_insert_own:INSERT:authenticated',
                        'avatars_select_own:SELECT:authenticated',
                        'avatars_update_own:UPDATE:authenticated'], false)
union all
select 4, 'every avatars policy limits to the avatars bucket and the caller''s own folder',
       coalesce((select bool_and(
                   (cmd = 'INSERT' or (qual like '%''avatars''%' and qual like '%is_own_avatar_path%'))
                   and (cmd in ('SELECT', 'DELETE')
                        or (with_check like '%''avatars''%' and with_check like '%is_own_avatar_path%')))
                 from pol), false)
union all
select 5, 'helper compares the first folder with auth.uid(), one level only',
       coalesce((select prosrc like '%auth.uid()%' and prosrc like '%array_length%' from fn), false)
union all
select 6, 'helper is not security definer and not executable by anon',
       coalesce((select not prosecdef
                        and not has_function_privilege('anon', oid, 'EXECUTE')
                        and has_function_privilege('authenticated', oid, 'EXECUTE')
                 from fn), false)
union all
select 7, 'event-banners policies unchanged',
       coalesce((select array_agg(policyname::text order by policyname) from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname like 'event\_banners\_%')
                = array['event_banners_delete_club_manager', 'event_banners_insert_club_manager',
                        'event_banners_select_club_manager', 'event_banners_update_club_manager'], false)
union all
select 8, 'info: ' || (select count(*) from storage.objects where bucket_id = 'avatars')
          || ' photo(s) uploaded, ' || (select count(*) from public.users where avatar_url is not null)
          || ' profile(s) with an avatar_url', true
order by sort;
