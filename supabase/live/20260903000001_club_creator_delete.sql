-- PASTE THIS WHOLE FILE into the live Supabase SQL editor and run it once.
-- It is supabase/migrations/20260903000001_club_creator_delete.sql wrapped in
-- one transaction: if any statement fails, nothing is applied.
--
-- Order:
--   1. supabase/tests/precheck_club_creator_delete_live.sql
--      (read-only; its first row, the summary, must say ok = true)
--   2. this file
--   3. supabase/tests/verify_club_creator_delete_live.sql
--      (read-only; every row ok = true)
--
-- Requires 20260902000001_security_hardening (applied on live once you've
-- confirmed it). It changes only the body of one trigger function; no table,
-- policy or constraint changes, so no existing row can break it. The check
-- below stops with a clear message, before anything changes, if this
-- migration is already applied or its predecessor is missing.
--
-- DEPLOY ORDER: this SQL can go before or after the app deploy; the app does
-- not depend on it. Deleting a club creator keeps failing until it is pasted.

begin;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.club_members'::regclass
      and tgname = 'club_members_guard_admin_changes'
  ) then
    raise exception '20260902000001_security_hardening is not applied (club_members_guard_admin_changes is missing). Apply it first. Nothing was changed.';
  end if;

  if to_regprocedure('public.prevent_club_protected_field_changes()') is null then
    raise exception 'public.prevent_club_protected_field_changes() is missing; the club admin foundation (20260826000001) is not applied. Nothing was changed.';
  end if;

  if position('sabha:creator-cleared-by-fk' in (
       select p.prosrc from pg_proc p
       where p.oid = 'public.prevent_club_protected_field_changes()'::regprocedure)) > 0 then
    raise exception '20260903000001_club_creator_delete is already applied (the guard already has the creator-clearing exception). Nothing was changed. Run supabase/tests/verify_club_creator_delete_live.sql instead.';
  end if;
end $$;

-- Deleting a user who created a club failed: clubs.created_by is
-- ON DELETE SET NULL, but the SET NULL runs as an UPDATE on clubs, and
-- prevent_club_protected_field_changes refused it ("only a super_admin can
-- change club ownership") because the deleter is not a super_admin (from the
-- SQL editor or the auth admin API auth.uid() is null).
--
-- The guard now lets exactly that automatic clearing through: created_by
-- going from a value to null while the user it pointed at no longer exists in
-- public.users. By the time the foreign key's SET NULL runs, the user row is
-- already deleted, so the test holds; for any API update the user row still
-- exists (the foreign key guarantees it did when the club was written), so
-- writing created_by, to null or to someone else, is still refused for anyone
-- who is not a super_admin.
--
-- Only the function body changes (same name and signature), so the existing
-- BEFORE UPDATE trigger clubs_prevent_protected_field_changes keeps using it.

create or replace function public.prevent_club_protected_field_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    if new.slug is distinct from old.slug then
      raise exception 'only a super_admin can change a club slug';
    end if;
    -- sabha:creator-cleared-by-fk
    -- The one allowed change: the foreign key's ON DELETE SET NULL after the
    -- creator's profile was deleted. A creator who still exists can't be
    -- cleared or replaced by anyone but a super_admin.
    if new.created_by is distinct from old.created_by
       and not (
         new.created_by is null
         and old.created_by is not null
         and not exists (select 1 from public.users u where u.id = old.created_by)
       ) then
      raise exception 'only a super_admin can change club ownership';
    end if;
    if new.verified is distinct from old.verified then
      raise exception 'only a super_admin can change verified status';
    end if;
  end if;
  return new;
end;
$$;

commit;
