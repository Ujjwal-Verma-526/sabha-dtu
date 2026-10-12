-- Security hardening: club-admin protection, URL and handle CHECKs, helper
-- probing, banner listing, TRUNCATE.
--
--   1. is_super_admin / is_club_manager only answer for the caller (L5)
--   2. club_members: admin rows, identity and the last admin (L3)
--   3. CHECKs on instagram_handle, logo_url and banner_url (L1)
--   4. event-banners: no anonymous listing
--   5. TRUNCATE revoked from anon and authenticated
--
-- No existing policy is loosened. The only policy change is the
-- event-banners SELECT policy in section 4, which narrows.

-- ---------------------------------------------------------------------
-- 1. Helpers only answer for the caller
-- ---------------------------------------------------------------------
--
-- Both helpers are SECURITY DEFINER and executable by anon and
-- authenticated: the public read policies on clubs and events call them, so
-- EXECUTE can't be revoked without rewriting those policies. That left
-- /rest/v1/rpc/is_super_admin and /rpc/is_club_manager open to anyone, with
-- any uid: a way to find out who the super admins and club managers are.
--
-- Every caller passes auth.uid() (the policies, the storage policies, the
-- guard triggers, and check_in_gate through its callers' auth.uid()), so the
-- helpers now answer false for any other uid. Policies behave exactly as
-- before; probing someone else, or probing as anon (auth.uid() is null),
-- always gets false.
--
-- coalesce(..., false) matters: `uid = auth.uid()` is null when either side
-- is null, and a null would turn `not is_super_admin(...)` in the guard
-- triggers into null, which an IF treats as "don't raise". The result is
-- always true or false, never null.
--
-- create or replace keeps the owner (postgres) and the existing grants.

create or replace function public.is_super_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(uid = auth.uid(), false)
     and exists (
       select 1 from public.users
       where id = uid and role = 'super_admin'
     );
$$;

create or replace function public.is_club_manager(uid uuid, target_club uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(uid = auth.uid(), false)
     and exists (
       select 1 from public.club_members
       where user_id = uid
         and club_id = target_club
         and status = 'approved'
         and role in ('admin', 'coordinator')
     );
$$;

-- ---------------------------------------------------------------------
-- 2. club_members: admin rows, identity, last admin
-- ---------------------------------------------------------------------
--
-- Coordinators rank below admins, but the club_members policies treat both
-- as "managers": a coordinator could remove, demote or add an admin. RLS
-- can't compare OLD with NEW or count other rows, so a trigger does it.
--
--   a. user_id and club_id never change on UPDATE (for anyone).
--   b. A row whose role is, or becomes, 'admin' can be inserted, updated or
--      deleted only by an approved admin of that club or a super admin.
--      Two exceptions: anyone may delete their OWN row (leaving, or "Request
--      again" after being rejected, which deletes the old row first), and
--      the first admin row of a new club, which handle_new_club inserts for
--      the club's created_by, passes.
--   c. A club never loses its last approved admin: deleting, demoting or
--      un-approving (rejecting, or back to pending) the only one is refused,
--      for every caller including super admins and the table owner. Add the
--      new admin first, then remove the old one.
--
-- Referential cascades always pass: deleting a club, or a user's account,
-- removes their membership rows even if that leaves no admin. They are told
-- apart by the parent row being gone, which only the cascade itself can
-- cause (the foreign keys guarantee both parents exist otherwise).
--
-- Rule c locks the club row before counting, so two admins removing each
-- other at the same moment can't both succeed: the second waits, then sees
-- the first one's change. FOR NO KEY UPDATE doesn't block ordinary member
-- inserts (they take FOR KEY SHARE through the foreign key).
--
-- The table owner is bound too, the same way the door check-in guard is. To
-- add or remove an admin from the SQL editor, act as a super admin for the
-- transaction:
--   select set_config('request.jwt.claims', json_build_object('sub', '<super admin id>')::text, true);
--
-- SECURITY DEFINER so the checks can see every row of the club whatever the
-- caller can see. The messages are matched by src/lib/db-errors.ts
-- (friendlyMembershipError); change both together.

create function public.guard_club_member_admin_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_club uuid;
  v_touches_admin boolean;
  v_allowed boolean;
  v_loses_admin boolean;
begin
  if tg_op = 'DELETE'
     and (not exists (select 1 from public.clubs where id = old.club_id)
          or not exists (select 1 from public.users where id = old.user_id)) then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (new.user_id is distinct from old.user_id
          or new.club_id is distinct from old.club_id) then
    raise exception 'a club membership can''t be moved to another club or person';
  end if;

  v_club := case when tg_op = 'DELETE' then old.club_id else new.club_id end;

  v_touches_admin :=
    (tg_op <> 'INSERT' and old.role = 'admin')
    or (tg_op <> 'DELETE' and new.role = 'admin');

  if v_touches_admin then
    -- coalesce: with no auth.uid() a comparison is null, and a null here
    -- must mean "not allowed", never "skip the check".
    v_allowed := coalesce(
      public.is_super_admin(v_uid)
      or exists (
        select 1 from public.club_members
        where club_id = v_club
          and user_id = v_uid
          and role = 'admin'
          and status = 'approved'
      )
      or (tg_op = 'DELETE' and old.user_id = v_uid)
      or (
        tg_op = 'INSERT'
        and pg_trigger_depth() > 1
        and new.role = 'admin'
        and new.status = 'approved'
        and exists (
          select 1 from public.clubs
          where id = new.club_id and created_by = new.user_id
        )
        and not exists (select 1 from public.club_members where club_id = new.club_id)
      ),
      false);

    if not v_allowed then
      raise exception 'only a club admin or a super admin can add, change or remove a club admin';
    end if;
  end if;

  v_loses_admin :=
    tg_op <> 'INSERT'
    and old.role = 'admin'
    and old.status = 'approved'
    and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'approved');

  if v_loses_admin then
    perform 1 from public.clubs where id = old.club_id for no key update;

    if not exists (
      select 1 from public.club_members
      where club_id = old.club_id
        and id <> old.id
        and role = 'admin'
        and status = 'approved'
    ) then
      raise exception 'a club must keep at least one approved admin';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- A trigger function needs no EXECUTE to fire; nobody should call it.
revoke execute on function public.guard_club_member_admin_changes() from public, anon, authenticated;

create trigger club_members_guard_admin_changes
  before insert or update or delete on public.club_members
  for each row execute function public.guard_club_member_admin_changes();

-- ---------------------------------------------------------------------
-- 3. Handle and URL CHECKs
-- ---------------------------------------------------------------------
--
-- Managers can PATCH clubs and events straight through the API, skipping the
-- forms. A stored `javascript:` or `data:` logo or banner is XSS the day it
-- is rendered, and a free-text handle is pasted into an instagram.com link.
--
-- The limits live HERE. src/lib/club-form.ts (handle) and
-- src/lib/storage-url.ts (image URLs) mirror them for the forms; change both
-- together. The forms additionally require image URLs to point at our own
-- Supabase storage, which the database can't know (it differs per project).
--
--   instagram_handle  null, or an optional @ then 1-30 letters, digits,
--                     dots or underscores
--   logo_url,         null, or at most 500 characters starting with https://
--   banner_url        (any letter case). The one http:// exception is the
--                     local Supabase stack's storage (127.0.0.1 or
--                     localhost, port 54321), so banner uploads still work in
--                     local development; on live it matches nothing useful.
--
-- clubs has no banner_url and events has no other link field; logo_url and
-- banner_url are the only stored image/link URLs outside users.avatar_url.

alter table public.clubs
  add constraint clubs_instagram_handle_format check (
    instagram_handle is null or instagram_handle ~ '^@?[A-Za-z0-9._]{1,30}$'
  ),
  add constraint clubs_logo_url_length check (
    logo_url is null or char_length(logo_url) <= 500
  ),
  add constraint clubs_logo_url_https check (
    logo_url is null
    or logo_url ~* '^(https://|http://(127\.0\.0\.1|localhost):54321/storage/v1/object/public/)'
  );

alter table public.events
  add constraint events_banner_url_length check (
    banner_url is null or char_length(banner_url) <= 500
  ),
  add constraint events_banner_url_https check (
    banner_url is null
    or banner_url ~* '^(https://|http://(127\.0\.0\.1|localhost):54321/storage/v1/object/public/)'
  );

-- ---------------------------------------------------------------------
-- 4. event-banners: no anonymous listing
-- ---------------------------------------------------------------------
--
-- event_banners_select_public (20260827000001) let anyone, anon included,
-- list every object in the bucket through the storage API. The bucket stays
-- public, so /storage/v1/object/public/event-banners/... URLs keep working
-- for everyone: those are served without consulting storage.objects
-- policies. Listing and metadata reads are now limited to the same people
-- who may upload to that club's folder.

drop policy event_banners_select_public on storage.objects;

create policy event_banners_select_club_manager
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'event-banners'
    and (
      public.is_club_manager(auth.uid(), public.storage_folder_club_id(name))
      or public.is_super_admin(auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 5. TRUNCATE
-- ---------------------------------------------------------------------
--
-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated. TRUNCATE ignores RLS entirely; PostgREST never issues it,
-- but nothing an API role does needs it. Revoked from every current table,
-- and from the defaults for tables postgres creates later.

revoke truncate on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
