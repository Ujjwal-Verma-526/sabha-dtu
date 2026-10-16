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
