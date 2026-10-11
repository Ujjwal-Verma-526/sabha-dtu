-- Door check-in: a manager of the event's club (or a super_admin) scans a
-- student's QR ticket, or checks them in by name, and the registration
-- becomes checked in. Check-in is impossible any other way.
--
-- What this adds:
--   - who checked a registration in (checked_in_by) and how (check_in_method)
--   - a guard trigger: check-in fields can only change inside the RPCs below,
--     registrations can never be moved to another event or person, and nobody
--     can register themselves as already checked in
--   - a delete guard: a student can't cancel a registration once checked in
--   - check_in_by_token, manual_check_in, undo_check_in: the only ways to
--     change check-in state; all rules live in check_in_gate
--   - get_event_check_in_list: names + check-in state for that event's managers
--
-- No existing policy or grant is changed. event_registrations_update_manager
-- still exists; updates that don't touch the guarded columns still pass it.

-- ---------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------

do $$
begin
  if to_regclass('public.registration_tickets') is null
     or to_regprocedure('public.get_my_registrations()') is null then
    raise exception 'apply 20260829000001_registration_tickets first';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_registrations'
      and column_name = 'checked_in_by'
  ) then
    raise exception '20260830000001_door_checkin is already applied (event_registrations.checked_in_by exists)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Who checked a registration in, and how
-- ---------------------------------------------------------------------
--
-- A manual check-in skips the ticket, so it is the kind worth auditing.
-- checked_in_by follows the schema's "keep the record, drop attribution"
-- convention when that account is deleted. Check-ins made before this
-- migration keep a null method and a null checked_in_by.

create type public.check_in_method as enum ('scan', 'manual');

alter table public.event_registrations
  add column checked_in_by uuid references public.users (id) on delete set null,
  add column check_in_method public.check_in_method,
  add constraint event_registrations_check_in_fields check (
    checked_in_at is not null
    or (checked_in_by is null and check_in_method is null)
  );

create index event_registrations_checked_in_by_idx
  on public.event_registrations (checked_in_by)
  where checked_in_by is not null;

-- ---------------------------------------------------------------------
-- 2. Guard: check-in only through the RPCs; registrations never move
-- ---------------------------------------------------------------------
--
-- Before this, `insert_self` let a student register with checked_in_at
-- already set, and `update_manager` let a manager set checked_in_at directly
-- or move a checked-in registration to another event or student.
--
-- A trigger rather than column privileges: a table-level grant can't have
-- columns carved out, Supabase's default privileges (or any later
-- `grant all`) would silently undo a column-level setup, and privileges
-- wouldn't cover the owner role or the move-a-row case.
--
-- The RPCs set the transaction-local flag sabha.check_in_rpc around their
-- single UPDATE. The flag only counts when current_user is not an API role:
-- inside the security definer RPCs it is the function owner. PostgREST
-- exposes neither set_config nor multi-statement transactions anyway.
--
-- One exemption: the ON DELETE SET NULL action on checked_in_by, which runs
-- as a nested statement (pg_trigger_depth() > 1) under the table owner and
-- only clears checked_in_by.

create function public.guard_registration_check_in()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.checked_in_at is not null
       or new.checked_in_by is not null
       or new.check_in_method is not null then
      raise exception 'check-in fields cannot be set when registering';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.event_id is distinct from old.event_id
     or new.user_id is distinct from old.user_id then
    raise exception 'a registration cannot be moved to another event or person';
  end if;

  if new.checked_in_at is not distinct from old.checked_in_at
     and new.checked_in_by is not distinct from old.checked_in_by
     and new.check_in_method is not distinct from old.check_in_method then
    return new;
  end if;

  if pg_trigger_depth() > 1
     and current_user not in ('anon', 'authenticated', 'service_role')
     and new.checked_in_by is null
     and new.checked_in_at is not distinct from old.checked_in_at
     and new.check_in_method is not distinct from old.check_in_method then
    return new;
  end if;

  if current_setting('sabha.check_in_rpc', true) = 'on'
     and current_user not in ('anon', 'authenticated', 'service_role') then
    return new;
  end if;

  raise exception 'check-in can only change through the door check-in functions';
end;
$$;

create trigger event_registrations_guard_check_in
  before insert or update on public.event_registrations
  for each row execute function public.guard_registration_check_in();

-- ---------------------------------------------------------------------
-- 3. Guard: a student can't cancel a registration once checked in
-- ---------------------------------------------------------------------
--
-- Otherwise a student could get in, delete their registration and free the
-- spot (or erase the record that they attended). Managers of the event's
-- club and super_admins can still delete it; RLS still decides who may
-- delete at all.
--
-- Referential cascades (deleting a user, an event or a club) run as nested
-- statements (pg_trigger_depth() > 1) and always pass, even when auth.uid()
-- happens to be the registrant. Security definer so it can read the event's
-- club whatever the student can see.

create function public.guard_checked_in_registration_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club_id uuid;
begin
  if old.checked_in_at is null
     or pg_trigger_depth() > 1
     or auth.uid() is distinct from old.user_id then
    return old;
  end if;

  select e.club_id into v_club_id
  from public.events e
  where e.id = old.event_id;

  if public.is_super_admin(auth.uid())
     or public.is_club_manager(auth.uid(), v_club_id) then
    return old;
  end if;

  raise exception 'a checked-in registration cannot be cancelled';
end;
$$;

create trigger event_registrations_guard_checked_in_delete
  before delete on public.event_registrations
  for each row execute function public.guard_checked_in_registration_delete();

-- ---------------------------------------------------------------------
-- 4. check_in_gate: the one place the check-in rules live
-- ---------------------------------------------------------------------
--
-- Returns null when p_uid may check people in to p_event_id right now,
-- otherwise the reason. Authorization comes first, and a missing event is
-- reported as not_authorized too, so callers learn nothing about events
-- they don't manage.
--
-- Window: opens 2 hours before start_at and closes 1 hour after the
-- effective end. The effective end is end_at, or start_at + 4 hours when
-- end_at isn't after start_at: the same rule as EVENT_END_FALLBACK_HOURS /
-- effectiveEventEnd in src/lib/tickets.ts (src/lib/check-in.ts holds the
-- 2 h / 1 h offsets for display). Change them together.
--
-- Invoker, with EXECUTE revoked from every API role: only the security
-- definer RPCs below (running as the owner) can call it.

create function public.check_in_gate(p_event_id uuid, p_uid uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_event record;
  v_effective_end timestamptz;
begin
  if p_uid is null then
    return 'not_authorized';
  end if;

  select e.club_id, e.status, e.start_at, e.end_at
    into v_event
  from public.events e
  where e.id = p_event_id;

  if not found then
    return 'not_authorized';
  end if;

  if not (public.is_club_manager(p_uid, v_event.club_id)
          or public.is_super_admin(p_uid)) then
    return 'not_authorized';
  end if;

  if v_event.status = 'cancelled' then
    return 'event_cancelled';
  end if;

  if v_event.status = 'draft' then
    return 'event_not_published';
  end if;

  v_effective_end := case
    when v_event.end_at > v_event.start_at then v_event.end_at
    else v_event.start_at + interval '4 hours'
  end;

  if v_event.status = 'completed'
     or now() > v_effective_end + interval '1 hour' then
    return 'event_ended';
  end if;

  if now() < v_event.start_at - interval '2 hours' then
    return 'too_early';
  end if;

  return null;
end;
$$;

revoke execute on function public.check_in_gate(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. check_in_by_token: the scanner
-- ---------------------------------------------------------------------
--
-- Every check-in RPC returns one row: (outcome, registration_id,
-- attendee_name, checked_in_at). Outcomes:
--   checked_in          done now; name, id and time filled
--   already_checked_in  name, id and the ORIGINAL time (never overwritten)
--   wrong_event         a valid ticket for a different event; no name or id,
--                       since it may be another club's registrant
--   invalid_token       not a token, unknown, or its registration was cancelled
--   plus every check_in_gate outcome
-- A cancelled registration is deleted (its ticket cascades away), so its
-- token comes back as invalid_token.
--
-- The registration row is locked (FOR UPDATE) before reading checked_in_at,
-- so two doors scanning the same ticket at once give one checked_in and one
-- already_checked_in. Every path locks only that one row: no deadlocks.

create function public.check_in_by_token(p_event_id uuid, p_token text)
returns table (
  outcome text,
  registration_id uuid,
  attendee_name text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_gate text;
  v_token text;
  v_reg record;
  v_name text;
  v_checked_in_at timestamptz;
begin
  v_gate := public.check_in_gate(p_event_id, v_uid);
  if v_gate is not null then
    return query select v_gate, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  -- Scanners and keyboard-wedge readers add whitespace or newlines; the
  -- token itself is 32 uppercase hex characters.
  v_token := upper(btrim(coalesce(p_token, ''), E' \t\r\n'));
  if v_token !~ '^[0-9A-F]{32}$' then
    return query select 'invalid_token'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select r.id, r.event_id, r.user_id, r.checked_in_at as at
    into v_reg
  from public.registration_tickets t
  join public.event_registrations r on r.id = t.registration_id
  where t.token = v_token
  for update of r;

  if not found then
    return query select 'invalid_token'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_reg.event_id <> p_event_id then
    return query select 'wrong_event'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select u.name into v_name from public.users u where u.id = v_reg.user_id;

  if v_reg.at is not null then
    return query select 'already_checked_in'::text, v_reg.id, v_name, v_reg.at;
    return;
  end if;

  perform set_config('sabha.check_in_rpc', 'on', true);
  update public.event_registrations r
     set checked_in_at = now(),
         checked_in_by = v_uid,
         check_in_method = 'scan'
   where r.id = v_reg.id
  returning r.checked_in_at into v_checked_in_at;
  perform set_config('sabha.check_in_rpc', 'off', true);

  return query select 'checked_in'::text, v_reg.id, v_name, v_checked_in_at;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. manual_check_in: check someone in by name, without their ticket
-- ---------------------------------------------------------------------
--
-- Same rules and outcomes as the scanner. An unknown registration id is
-- not_authorized, like an event the caller doesn't manage.

create function public.manual_check_in(p_registration_id uuid)
returns table (
  outcome text,
  registration_id uuid,
  attendee_name text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_event_id uuid;
  v_gate text;
  v_reg record;
  v_name text;
  v_checked_in_at timestamptz;
begin
  select r.event_id into v_event_id
  from public.event_registrations r
  where r.id = p_registration_id;

  if not found then
    return query select 'not_authorized'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  v_gate := public.check_in_gate(v_event_id, v_uid);
  if v_gate is not null then
    return query select v_gate, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select r.id, r.user_id, r.checked_in_at as at
    into v_reg
  from public.event_registrations r
  where r.id = p_registration_id
  for update;

  if not found then
    -- Cancelled between the two reads.
    return query select 'not_authorized'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select u.name into v_name from public.users u where u.id = v_reg.user_id;

  if v_reg.at is not null then
    return query select 'already_checked_in'::text, v_reg.id, v_name, v_reg.at;
    return;
  end if;

  perform set_config('sabha.check_in_rpc', 'on', true);
  update public.event_registrations r
     set checked_in_at = now(),
         checked_in_by = v_uid,
         check_in_method = 'manual'
   where r.id = v_reg.id
  returning r.checked_in_at into v_checked_in_at;
  perform set_config('sabha.check_in_rpc', 'off', true);

  return query select 'checked_in'::text, v_reg.id, v_name, v_checked_in_at;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. undo_check_in: reverse a wrong tap
-- ---------------------------------------------------------------------
--
-- Without it, a mis-tap in the name list would leave a permanent bogus
-- check-in and the real student's scan would come back amber. Same gate,
-- so it only works for the event's managers, inside the window. Outcomes:
-- undone (name and id filled), not_checked_in, or a gate outcome. Clears
-- all three fields; there is no history of undos.

create function public.undo_check_in(p_registration_id uuid)
returns table (
  outcome text,
  registration_id uuid,
  attendee_name text,
  checked_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_event_id uuid;
  v_gate text;
  v_reg record;
  v_name text;
begin
  select r.event_id into v_event_id
  from public.event_registrations r
  where r.id = p_registration_id;

  if not found then
    return query select 'not_authorized'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  v_gate := public.check_in_gate(v_event_id, v_uid);
  if v_gate is not null then
    return query select v_gate, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select r.id, r.user_id, r.checked_in_at as at
    into v_reg
  from public.event_registrations r
  where r.id = p_registration_id
  for update;

  if not found then
    return query select 'not_authorized'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_reg.at is null then
    return query select 'not_checked_in'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select u.name into v_name from public.users u where u.id = v_reg.user_id;

  perform set_config('sabha.check_in_rpc', 'on', true);
  update public.event_registrations r
     set checked_in_at = null,
         checked_in_by = null,
         check_in_method = null
   where r.id = v_reg.id;
  perform set_config('sabha.check_in_rpc', 'off', true);

  return query select 'undone'::text, v_reg.id, v_name, null::timestamptz;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. get_event_check_in_list: who's registered, for the door
-- ---------------------------------------------------------------------
--
-- Name and check-in state only: no token, ticket_code, email, user_id or
-- roll number. Only that event's managers and super_admins get rows;
-- anyone else gets an empty set (same pattern as get_club_member_profiles).

create function public.get_event_check_in_list(p_event_id uuid)
returns table (
  registration_id uuid,
  name text,
  checked_in_at timestamptz,
  check_in_method public.check_in_method
)
language sql
security definer
set search_path = ''
stable
as $$
  select r.id, u.name, r.checked_in_at, r.check_in_method
  from public.event_registrations r
  join public.events e on e.id = r.event_id
  join public.users u on u.id = r.user_id
  where r.event_id = p_event_id
    and (public.is_club_manager(auth.uid(), e.club_id)
         or public.is_super_admin(auth.uid()))
  order by u.name, r.id;
$$;

-- ---------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------

revoke execute on function public.check_in_by_token(uuid, text) from public, anon;
grant execute on function public.check_in_by_token(uuid, text) to authenticated;

revoke execute on function public.manual_check_in(uuid) from public, anon;
grant execute on function public.manual_check_in(uuid) to authenticated;

revoke execute on function public.undo_check_in(uuid) from public, anon;
grant execute on function public.undo_check_in(uuid) to authenticated;

revoke execute on function public.get_event_check_in_list(uuid) from public, anon;
grant execute on function public.get_event_check_in_list(uuid) to authenticated;
