-- Registration closes when the event starts, unless the organiser set a
-- later registration deadline.
--
-- Before this, an event with no registration_deadline stayed open for
-- registration forever, and a deadline could not be later than start_at.
-- Now:
--   - closes_at = coalesce(registration_deadline, start_at)
--   - registration is refused from closes_at onward (now() >= closes_at)
--   - a deadline may sit anywhere up to the event's effective end, so an
--     organiser can keep registration open for walk-ins after the event
--     has started
--
-- The effective end (end_at, or start_at + 4 hours when end_at isn't after
-- start_at) now lives in one SQL function, event_effective_end, used by the
-- deadline CHECK and by check_in_gate.
--
-- Requires 20260830000001_door_checkin (check_in_gate is rewritten to call
-- the new function; its rules don't change).
--
-- Existing registrations are untouched: the guard is a BEFORE INSERT
-- trigger, so it only ever looks at new registrations. No policy changes.

-- ---------------------------------------------------------------------
-- 1. event_effective_end: the one place the effective-end rule lives
-- ---------------------------------------------------------------------
--
-- end_at is NOT NULL and events_end_after_start guarantees end_at >=
-- start_at, so "end_at isn't after start_at" means end_at = start_at: the
-- organiser gave no separate end time. Such an event counts as running for
-- 4 hours. Mirrors EVENT_END_FALLBACK_HOURS / effectiveEventEnd in
-- src/lib/tickets.ts. Change them together.
--
-- Immutable: adding an hours-only interval to a timestamptz doesn't depend
-- on the session time zone (only day and month units do). Executable by
-- authenticated because the events CHECK below runs it as the user who
-- writes the event; nothing else needs it.

create function public.event_effective_end(p_start_at timestamptz, p_end_at timestamptz)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_end_at > p_start_at then p_end_at
    else p_start_at + interval '4 hours'
  end;
$$;

revoke execute on function public.event_effective_end(timestamptz, timestamptz) from public, anon;
grant execute on function public.event_effective_end(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 2. check_in_gate uses it
-- ---------------------------------------------------------------------
--
-- Same body as 20260830000001 except the effective end now comes from
-- event_effective_end instead of an inline copy of the rule. create or
-- replace keeps the owner and the revoked EXECUTE; the revoke is repeated
-- so this file states it too.

create or replace function public.check_in_gate(p_event_id uuid, p_uid uuid)
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

  v_effective_end := public.event_effective_end(v_event.start_at, v_event.end_at);

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
-- 3. Deadline may be as late as the effective end
-- ---------------------------------------------------------------------
--
-- The old constraint (events_deadline_before_start, 20260825000001) capped
-- the deadline at start_at. Every existing row has deadline <= start_at <=
-- effective end, so the new constraint holds for all of them. (The live
-- paste file checks this first and stops with a clear message if not.)

alter table public.events
  drop constraint events_deadline_before_start;

alter table public.events
  add constraint events_deadline_before_end check (
    registration_deadline is null
    or registration_deadline <= public.event_effective_end(start_at, end_at)
  );

-- ---------------------------------------------------------------------
-- 4. The registration guard
-- ---------------------------------------------------------------------
--
-- Replaces the body from 20260828000001; the trigger
-- event_registrations_enforce_rules already points at this function name,
-- and create or replace keeps its owner, security definer setting and
-- grants. Still takes the row lock on the event, so the capacity check
-- stays race-proof. It never needs the end time: the CHECK above already
-- keeps the deadline within the event.
--
-- The deadline check now reads "registration is closed" for both an
-- explicit deadline and the start-time default; the app maps that message.

create or replace function public.enforce_registration_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event record;
  current_count integer;
begin
  select status, start_at, registration_deadline, capacity
    into target_event
    from public.events
    where id = new.event_id
    for update;

  if not found then
    raise exception 'event not found';
  end if;

  if target_event.status <> 'published' then
    raise exception 'event is not open for registration';
  end if;

  if now() >= coalesce(target_event.registration_deadline, target_event.start_at) then
    raise exception 'registration is closed';
  end if;

  if target_event.capacity is not null then
    select count(*) into current_count
      from public.event_registrations
      where event_id = new.event_id;

    if current_count >= target_event.capacity then
      raise exception 'event is at capacity';
    end if;
  end if;

  return new;
end;
$$;
