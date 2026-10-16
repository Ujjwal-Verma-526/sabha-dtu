-- PASTE THIS WHOLE FILE into the live Supabase SQL editor and run it once.
-- It is supabase/migrations/20260905000001_avatar_storage.sql wrapped in
-- one transaction: if any statement fails, nothing is applied.
--
-- Order:
--   1. supabase/tests/precheck_avatar_storage_live.sql
--      (read-only; its first row, the summary, must say ok = true)
--   2. this file
--   3. supabase/tests/verify_avatar_storage_live.sql
--      (read-only; every row ok = true, the last one is informational)
--
-- Requires only Supabase Storage itself (storage.buckets, storage.objects,
-- storage.foldername) and public.users.avatar_url. It doesn't depend on any
-- other Sabha migration since 20260825000001, so it can go before or after
-- them. The check below stops with a clear message, before anything changes,
-- if this migration is already applied, or if an `avatars` bucket, an
-- avatars_* storage policy or public.is_own_avatar_path already exists
-- (made by hand), so nothing is silently merged with it.
--
-- It adds no constraint and changes no existing row, policy or function.
--
-- DEPLOY ORDER: paste this BEFORE deploying the app. The new /profile
-- uploads to the avatars bucket; until the bucket exists, "Upload photo"
-- fails with a "Bucket not found" error (everything else keeps working). The
-- old app never touches the bucket, so pasting first is safe.

begin;

do $$
declare
  v_policies text;
begin
  if exists (select 1 from storage.buckets where id = 'avatars')
     and exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'avatars_insert_own')
     and to_regprocedure('public.is_own_avatar_path(text)') is not null then
    raise exception '20260905000001_avatar_storage is already applied (the avatars bucket, avatars_insert_own and is_own_avatar_path exist). Nothing was changed. Run supabase/tests/verify_avatar_storage_live.sql instead.';
  end if;

  if exists (select 1 from storage.buckets where id = 'avatars' or name = 'avatars') then
    raise exception 'A storage bucket named avatars already exists (% object(s) in it), but this migration did not make it. This file creates the bucket itself, so it must not run until that bucket is sorted out: ask before applying. Nothing was changed.',
      (select count(*) from storage.objects where bucket_id = 'avatars');
  end if;

  select string_agg(policyname, ', ' order by policyname) into v_policies
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and (policyname like 'avatars\_%'
         or coalesce(qual, '') || coalesce(with_check, '') like '%''avatars''%');
  if v_policies is not null then
    raise exception 'storage.objects already has avatar policies this migration did not make: %. Ask before applying. Nothing was changed.', v_policies;
  end if;

  if to_regprocedure('public.is_own_avatar_path(text)') is not null then
    raise exception 'public.is_own_avatar_path(text) already exists, but this migration did not make it. Ask before applying. Nothing was changed.';
  end if;

  if to_regprocedure('storage.foldername(text)') is null then
    raise exception 'storage.foldername(text) is missing; Supabase Storage is not what this migration expects. Nothing was changed.';
  end if;

  if not exists (select 1 from pg_attribute
                 where attrelid = 'public.users'::regclass
                   and attname = 'avatar_url' and not attisdropped) then
    raise exception 'public.users.avatar_url is missing; the schema is not what this migration expects. Nothing was changed.';
  end if;
end $$;

-- Profile photos: a public `avatars` bucket where each user may upload,
-- replace, list and delete only the objects in their own folder.
--
-- Path convention: every object key is "{user_id}/{file}", exactly one folder
-- deep, where user_id is the uploader's auth.uid(). The policies below hold
-- every write to that folder, so a second user can't add to, overwrite, move
-- into or delete from someone else's folder.
--
-- Reads: the bucket is public, so /storage/v1/object/public/avatars/... URLs
-- work for everyone, signed in or not (avatars appear next to names). Those
-- are served without consulting storage.objects policies. Listing and
-- metadata reads through the storage API are limited to the owner's own
-- folder, the same stance as event-banners (20260902000001): nobody can
-- enumerate other people's photos.
--
-- No super admin exception: only the owner manages their files. A super admin
-- can still clear users.avatar_url (users_update_super_admin), and the file
-- itself can be removed from the dashboard if it ever has to go.
--
-- users.avatar_url and its CHECKs (20260901000001) are unchanged. The app
-- only shows an avatar whose URL is a public object in this bucket under
-- that user's own folder (src/lib/avatar.ts), so an old external URL, or one
-- pointing at someone else's folder, shows initials instead.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB, the same limit as event-banners (src/lib/image-upload.ts)
  array['image/jpeg', 'image/png', 'image/webp']
);

-- True when `object_name` is "{auth.uid()}/{file}": one folder, the caller's
-- own. foldername() of "a/b/c.jpg" is {a,b}, so the length check refuses
-- deeper paths; a name with no folder gives an empty array, which fails both
-- checks. auth.uid() is null for anon, so the comparison is never true there.
create function public.is_own_avatar_path(object_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    array_length(storage.foldername(object_name), 1) = 1
    and (storage.foldername(object_name))[1] = auth.uid()::text,
    false);
$$;

revoke execute on function public.is_own_avatar_path(text) from public, anon;
grant execute on function public.is_own_avatar_path(text) to authenticated;

create policy avatars_select_own
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and public.is_own_avatar_path(name));

create policy avatars_insert_own
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and public.is_own_avatar_path(name));

-- USING picks rows the caller owns; WITH CHECK stops a move or rename out of
-- their folder (or into another bucket).
create policy avatars_update_own
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and public.is_own_avatar_path(name))
  with check (bucket_id = 'avatars' and public.is_own_avatar_path(name));

create policy avatars_delete_own
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and public.is_own_avatar_path(name));

commit;
