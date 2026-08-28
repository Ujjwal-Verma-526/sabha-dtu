-- Helper functions used by RLS policies, plus defense-in-depth triggers
-- that block privilege escalation even if a policy is ever loosened by
-- mistake. All helper functions are `security definer`, owned by the
-- migration role (postgres), so they read past RLS deliberately and on
-- purpose — this is the standard, sanctioned way to let a policy check
-- "is this user an admin of club X" without a recursive RLS lookup.

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------

create function public.is_super_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users
    where id = uid and role = 'super_admin'
  );
$$;

-- "Manager" = approved club_members row with role admin or coordinator.
-- Deliberately named apart from public.user_role's 'club_admin' value —
-- this checks per-club standing in club_members, not the site-wide role.
create function public.is_club_manager(uid uuid, target_club uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_members
    where user_id = uid
      and club_id = target_club
      and status = 'approved'
      and role in ('admin', 'coordinator')
  );
$$;

-- ---------------------------------------------------------------------
-- Guard: nobody can change their own site-wide role via a client update,
-- even though the UPDATE policy on public.users allows editing your own
-- row (for name/roll_number/branch/batch_year/avatar_url). Only a
-- super_admin (or the system, which doesn't go through this path) may
-- change role, email, or id.
-- ---------------------------------------------------------------------

create function public.prevent_user_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role
      or new.email is distinct from old.email
      or new.id is distinct from old.id)
     and not public.is_super_admin(auth.uid()) then
    raise exception 'not permitted to change role, email, or id';
  end if;
  return new;
end;
$$;

create trigger users_prevent_privilege_escalation
  before update on public.users
  for each row execute function public.prevent_user_privilege_escalation();

-- ---------------------------------------------------------------------
-- Guard: nobody can approve or promote their own club_members row, even
-- a club admin/coordinator acting through the "manager" RLS path. Role
-- and status changes to your OWN row require a super_admin.
-- ---------------------------------------------------------------------

create function public.prevent_membership_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id = auth.uid()
     and (new.role is distinct from old.role or new.status is distinct from old.status)
     and not public.is_super_admin(auth.uid()) then
    raise exception 'cannot change your own membership role or status';
  end if;
  return new;
end;
$$;

create trigger club_members_prevent_self_escalation
  before update on public.club_members
  for each row execute function public.prevent_membership_self_escalation();

-- ---------------------------------------------------------------------
-- Convenience: whoever creates a club is auto-enrolled as its first
-- approved admin, so they can manage it immediately without a second
-- privileged step. This runs as the function owner (bypasses RLS), so it
-- works even though club_members' own INSERT policy wouldn't otherwise
-- let a brand-new club's creator insert an *approved admin* row for
-- themselves (self-inserts are restricted to pending/member — see the
-- RLS migration).
-- ---------------------------------------------------------------------

create function public.handle_new_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.club_members (club_id, user_id, role, status)
    values (new.id, new.created_by, 'admin', 'approved')
    on conflict (club_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger clubs_auto_enroll_creator
  after insert on public.clubs
  for each row execute function public.handle_new_club();

-- ---------------------------------------------------------------------
-- Ticket codes are never client-supplied: generate one server-side on
-- every insert, overwriting whatever (if anything) the client sent, so a
-- student can't forge or guess another ticket's code by choosing it.
-- ---------------------------------------------------------------------

create function public.generate_ticket_code()
returns trigger
language plpgsql
as $$
begin
  new.ticket_code = upper(encode(gen_random_bytes(6), 'hex'));
  return new;
end;
$$;

create trigger event_registrations_generate_ticket_code
  before insert on public.event_registrations
  for each row execute function public.generate_ticket_code();
