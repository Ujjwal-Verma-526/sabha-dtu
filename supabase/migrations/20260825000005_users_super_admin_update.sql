-- Gap fix: users_update_own (20260825000004) only lets someone update their
-- own row. That left no RLS path for a super_admin to manage anyone else's
-- profile or role — the only way to promote a second super_admin would have
-- been the manual disable-trigger bootstrap every time, which defeats the
-- point of having a super_admin role at all. This adds the missing path.
--
-- Safe to add on top of users_update_own: Postgres RLS policies for the
-- same command combine with OR, so this only ever grants additional access
-- to confirmed super_admins — it cannot loosen anything for anyone else.
-- The users_prevent_privilege_escalation trigger still gates the actual
-- role/email/id change itself, so this policy alone doesn't hand out
-- escalation — it just lets a super_admin's already-permitted UPDATE reach
-- rows other than their own.

create policy users_update_super_admin
  on public.users for update
  to authenticated
  using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));
