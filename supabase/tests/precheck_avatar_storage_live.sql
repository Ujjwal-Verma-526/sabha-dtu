-- Run in the live SQL editor BEFORE pasting
-- supabase/live/20260905000001_avatar_storage.sql.
-- Read-only: one SELECT, changes nothing. Safe to run any number of times.
--
-- This migration adds no constraint, so no existing row can break it. The
-- summary row (first) says whether it can be pasted now:
--   ok = true   nothing named avatars exists yet, and Storage looks as expected.
-- Rows below it:
--   no_bucket        no storage bucket named avatars (the file creates it)
--   no_policies      no storage.objects policy named avatars_* or naming the
--                    avatars bucket
--   no_helper        public.is_own_avatar_path(text) doesn't exist
--   storage          storage.foldername(text) exists
--   avatar_column    public.users.avatar_url exists
--   avatar_urls      informational: profiles with an avatar_url today. None of
--                    them is in the new bucket yet, so each of them shows
--                    initials until that person uploads a photo. Nothing is
--                    changed or removed.
with state as (
  select
    not exists (select 1 from storage.buckets where id = 'avatars' or name = 'avatars') as no_bucket,
    not exists (select 1 from pg_policies
                where schemaname = 'storage' and tablename = 'objects'
                  and (policyname like 'avatars\_%'
                       or coalesce(qual, '') || coalesce(with_check, '') like '%''avatars''%')) as no_policies,
    to_regprocedure('public.is_own_avatar_path(text)') is null as no_helper,
    to_regprocedure('storage.foldername(text)') is not null as storage_ok,
    exists (select 1 from pg_attribute
            where attrelid = 'public.users'::regclass
              and attname = 'avatar_url' and not attisdropped) as column_ok
)
select 0 as sort, 'summary' as check_name,
       (no_bucket and no_policies and no_helper and storage_ok and column_ok) as ok,
       case when not no_bucket and not no_policies and not no_helper
              then '20260905000001 looks already applied: run verify_avatar_storage_live.sql instead.'
            when not no_bucket then 'an avatars bucket already exists (not made by this migration): ask before pasting.'
            when not no_policies then 'avatar storage policies already exist: ask before pasting.'
            when not no_helper then 'is_own_avatar_path already exists: ask before pasting.'
            when not (storage_ok and column_ok) then 'Storage or public.users is not what this migration expects: ask before pasting.'
            else 'ready to paste' end as detail
from state
union all
select 1, 'no_bucket', no_bucket,
       case when no_bucket then 'no avatars bucket yet'
            else (select count(*) from storage.objects where bucket_id = 'avatars')
                 || ' object(s) in an existing avatars bucket' end
from state
union all
select 2, 'no_policies', no_policies,
       coalesce((select string_agg(policyname, ', ' order by policyname) from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and (policyname like 'avatars\_%'
                        or coalesce(qual, '') || coalesce(with_check, '') like '%''avatars''%')),
                'none')
from state
union all
select 3, 'no_helper', no_helper, 'public.is_own_avatar_path(text)' from state
union all
select 4, 'storage', storage_ok, 'storage.foldername(text)' from state
union all
select 5, 'avatar_column', column_ok, 'public.users.avatar_url' from state
union all
select 6, 'avatar_urls', true,
       (select count(*) from public.users where avatar_url is not null)
       || ' profile(s) have an avatar_url; they show initials until they upload a photo'
order by sort;
