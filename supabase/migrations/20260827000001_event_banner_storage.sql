-- Storage for event banner images, needed by the event creation/discovery
-- feature. Bucket is public-read (banners must render on the public
-- /events/[slug] page and in WhatsApp/Instagram link previews without
-- auth) but writes are restricted to the uploading club's own managers,
-- mirroring the is_club_manager check already used on public.events.
--
-- Path convention enforced by the app, not the database: every object key
-- is "{club_id}/{filename}". storage_folder_club_id() below parses that
-- first path segment defensively — an unparseable/missing segment (e.g. an
-- attacker probing with a non-uuid path) yields null, and
-- is_club_manager(uid, null) is simply false, not an error.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-banners',
  'event-banners',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create function public.storage_folder_club_id(object_name text)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  club uuid;
begin
  begin
    club := (storage.foldername(object_name))[1]::uuid;
  exception when others then
    return null;
  end;
  return club;
end;
$$;

-- Read: public bucket, so this mainly covers listing/metadata reads
-- through the API rather than the CDN-served public URL, but it's
-- harmless and consistent to allow it outright.
create policy event_banners_select_public
  on storage.objects for select
  using (bucket_id = 'event-banners');

-- Insert: only a manager of the club named by the object's own folder —
-- never an arbitrary club_id claimed elsewhere, since the club_id here IS
-- the path itself.
create policy event_banners_insert_club_manager
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-banners'
    and (
      public.is_club_manager(auth.uid(), public.storage_folder_club_id(name))
      or public.is_super_admin(auth.uid())
    )
  );

-- Update/delete: same club-manager check, so a manager can replace or
-- remove a banner they own; a manager of a different club can't touch it
-- since the folder (and thus the check) belongs to someone else's club.
create policy event_banners_update_club_manager
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'event-banners'
    and (
      public.is_club_manager(auth.uid(), public.storage_folder_club_id(name))
      or public.is_super_admin(auth.uid())
    )
  )
  with check (
    bucket_id = 'event-banners'
    and (
      public.is_club_manager(auth.uid(), public.storage_folder_club_id(name))
      or public.is_super_admin(auth.uid())
    )
  );

create policy event_banners_delete_club_manager
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-banners'
    and (
      public.is_club_manager(auth.uid(), public.storage_folder_club_id(name))
      or public.is_super_admin(auth.uid())
    )
  );
