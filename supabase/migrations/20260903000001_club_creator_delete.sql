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
