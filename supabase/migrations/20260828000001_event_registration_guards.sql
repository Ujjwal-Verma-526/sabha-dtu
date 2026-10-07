-- Registration foundation, part 2: server-side enforcement that RLS alone
-- can't express (registration deadline, capacity) plus a privacy-safe way
-- for the public to know an event is full.
--
-- event_registrations_insert_self (20260825000004) already restricts an
-- insert to the caller's own user_id on a currently-published event, and
-- the unique(event_id, user_id) constraint (20260825000001) already stops
-- duplicate registrations. Neither of those can express "before the
-- deadline" or "under capacity" — both depend on other rows/columns, not
-- just the inserted row — so that lives in a BEFORE INSERT trigger here.
-- No existing policy is changed.

-- ---------------------------------------------------------------------
-- Trigger: enforce_registration_rules
-- ---------------------------------------------------------------------
--
-- Security definer so it can read the target event's status/deadline/
-- capacity and count existing registrations regardless of the caller's
-- own RLS visibility (same rationale as is_club_manager / is_super_admin
-- in 20260825000003) — this function only ever reports pass/fail via an
-- exception, it never returns row data to the caller.
--
-- The `for update` lock on the event row is what actually makes capacity
-- race-proof: two concurrent registration attempts for the same event
-- both try to lock the same events row, so the second one waits until the
-- first's transaction (insert + trigger) has committed or rolled back
-- before it re-counts. Without the lock, both could read
-- "capacity not yet reached" and both succeed, overselling the event.
create function public.enforce_registration_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event record;
  current_count integer;
begin
  select status, registration_deadline, capacity
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

  if target_event.registration_deadline is not null
     and now() > target_event.registration_deadline then
    raise exception 'registration deadline has passed';
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

create trigger event_registrations_enforce_rules
  before insert on public.event_registrations
  for each row execute function public.enforce_registration_rules();

-- ---------------------------------------------------------------------
-- RPC: get_event_registration_count
-- ---------------------------------------------------------------------
--
-- event_registrations_select_self_or_manager (20260825000004) deliberately
-- only lets a user read their OWN registration row — nobody outside a
-- club's management chain can see who else registered. That means a
-- plain client-side count() is unavailable to a regular visitor, but the
-- public event page still needs to know "is this full?" to render an
-- accurate CTA. This function exposes only the aggregate count — never
-- individual rows, never who registered — to anyone, mirroring the
-- get_club_member_profiles pattern of a narrow security-definer read.
create function public.get_event_registration_count(target_event uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.event_registrations
  where event_id = target_event;
$$;

grant execute on function public.get_event_registration_count(uuid) to anon, authenticated;
