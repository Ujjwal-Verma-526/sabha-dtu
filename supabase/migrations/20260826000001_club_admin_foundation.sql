-- Two RLS changes, both required for the club directory/administration
-- feature being added now — not a general security pass.
--
-- 1. Product rule change: Sabha launches with real DTU societies only.
--    Students must not be able to self-create clubs. clubs_insert_self
--    (20260825000004) let any authenticated user insert an unverified
--    club — that's exactly the "arbitrary/fake clubs in the directory"
--    risk the product now explicitly rules out. Replaced with
--    super_admin-only creation.
--
-- 2. Genuine bug found while building the club-admin edit UI:
--    clubs_update_manager_no_self_verify's WITH CHECK required
--    `verified = false` on every manager-driven UPDATE. WITH CHECK
--    evaluates the proposed NEW row, and an edit that doesn't touch
--    `verified` still carries its current value forward — so the very
--    first edit to an ALREADY-verified club (the normal case once
--    launched) would be silently rejected by RLS. The same policy also
--    never actually constrained `created_by`, since WITH CHECK only
--    inspected `verified` — a manager could reassign club ownership to
--    an arbitrary uuid in the same UPDATE and the policy would not
--    notice. Both are fixed the same way the users/club_members
--    self-escalation guards already work elsewhere in this schema: a
--    BEFORE UPDATE trigger that compares NEW against OLD, which a bare
--    WITH CHECK clause cannot do.

-- ---------------------------------------------------------------------
-- 1. Club creation: super_admin only
-- ---------------------------------------------------------------------

drop policy if exists clubs_insert_self on public.clubs;

create policy clubs_insert_super_admin
  on public.clubs for insert
  to authenticated
  with check (public.is_super_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 2. Club update: managers can edit their club; slug/created_by/verified
--    are protected by a trigger instead of a (broken) WITH CHECK clause.
-- ---------------------------------------------------------------------

drop policy if exists clubs_update_manager_no_self_verify on public.clubs;

create policy clubs_update_manager_or_super_admin
  on public.clubs for update
  to authenticated
  using (
    public.is_club_manager(auth.uid(), id)
    or public.is_super_admin(auth.uid())
  )
  with check (
    public.is_club_manager(auth.uid(), id)
    or public.is_super_admin(auth.uid())
  );

create function public.prevent_club_protected_field_changes()
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
    if new.created_by is distinct from old.created_by then
      raise exception 'only a super_admin can change club ownership';
    end if;
    if new.verified is distinct from old.verified then
      raise exception 'only a super_admin can change verified status';
    end if;
  end if;
  return new;
end;
$$;

create trigger clubs_prevent_protected_field_changes
  before update on public.clubs
  for each row execute function public.prevent_club_protected_field_changes();
