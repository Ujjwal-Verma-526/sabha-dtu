-- PASTE THIS WHOLE FILE into the live Supabase SQL editor and run it once.
-- It is supabase/migrations/20260831000001_registration_closes_at_start.sql
-- wrapped in one transaction: if any statement fails, nothing is applied.
--
-- Requires 20260828000001_event_registration_guards (already on live). It does
-- NOT depend on the door check-in migration, so the two can go in either order.
-- Running it a second time stops at the precondition check with
-- "20260831000001_registration_closes_at_start is already applied" and
-- changes nothing.
--
-- What it changes: registration now closes at start_at unless a later
-- registration_deadline (up to end_at) is set. Existing registrations are
-- not touched.
--
-- Afterwards, run supabase/tests/verify_registration_closes_at_start_live.sql
-- (read-only). Every row should say ok = true.

begin;

-- ---------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.enforce_registration_rules()') is null
     or not exists (
       select 1 from pg_constraint
       where conrelid = 'public.events'::regclass
         and conname in ('events_deadline_before_start', 'events_deadline_before_end')
     ) then
    raise exception 'apply 20260828000001_event_registration_guards first';
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_deadline_before_end'
  ) then
    raise exception '20260831000001_registration_closes_at_start is already applied (events_deadline_before_end exists)';
  end if;
end;
$$;

-- Registration closes when the event starts, unless the organiser set a
-- later registration deadline.
--
-- Before this, an event with no registration_deadline stayed open for
-- registration forever, and a deadline could not be later than start_at.
-- Now:
--   - closes_at = coalesce(registration_deadline, start_at)
--   - registration is refused from closes_at onward (now() >= closes_at)
--   - a deadline may sit anywhere up to end_at, so an organiser can keep
--     registration open for walk-ins after the event has started
--
-- Existing registrations are untouched: the guard is a BEFORE INSERT
-- trigger, so it only ever looks at new registrations. No policy or grant
-- changes.

-- ---------------------------------------------------------------------
-- 1. Deadline may be as late as end_at
-- ---------------------------------------------------------------------
--
-- The old constraint (events_deadline_before_start, 20260825000001) capped
-- the deadline at start_at. Every existing row has deadline <= start_at <=
-- end_at, so the new constraint holds for all of them.

alter table public.events
  drop constraint events_deadline_before_start;

alter table public.events
  add constraint events_deadline_before_end check (
    registration_deadline is null or registration_deadline <= end_at
  );

-- ---------------------------------------------------------------------
-- 2. The registration guard
-- ---------------------------------------------------------------------
--
-- Replaces the body from 20260828000001; the trigger
-- event_registrations_enforce_rules already points at this function name,
-- and create or replace keeps its owner, security definer setting and
-- grants. Still takes the row lock on the event, so the capacity check
-- stays race-proof.
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

commit;
