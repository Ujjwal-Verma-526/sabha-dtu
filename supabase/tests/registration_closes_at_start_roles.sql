-- Role tests for 20260831000001_registration_closes_at_start.sql.
-- Runs entirely inside one transaction and ends in ROLLBACK: nothing persists.
-- LOCAL STACK ONLY. Never run against the live project.
--
--   npx supabase start
--   docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/registration_closes_at_start_roles.sql
--
-- Every row of the final report should say PASS.
--
-- The rule: registration closes at coalesce(registration_deadline, start_at),
-- from that instant on (now() >= closes_at). A deadline may be as late as
-- the effective end (end_at, or start_at + 4 h when end_at = start_at).
-- Existing registrations are never touched.
--
-- Actors:  A, B, C, D, E = students, M = admin of the event's club,
--          S = super_admin.
-- A user is simulated with SET LOCAL ROLE authenticated + a request.jwt.claims
-- `sub`, which is what auth.uid() reads. now() is fixed inside a transaction,
-- so "start_at = now()" and "now() + 1 second" hit the boundary exactly.

\set ON_ERROR_STOP on
begin;

create temp table t_results (n serial, name text, pass boolean, detail text);
create temp table t_ctx (k text primary key, v text);
grant all on t_results, t_ctx to public;
grant usage on sequence t_results_n_seq to public;

create function pg_temp.ok(name text, pass boolean, detail text default '')
returns void language sql as $$
  insert into t_results (name, pass, detail) values ($1, coalesce($2, false), $3);
$$;

create function pg_temp.ctx(key text) returns text language sql stable as $$
  select v from t_ctx where k = key;
$$;

create function pg_temp.ev(name text) returns uuid language sql stable as $$
  select v::uuid from t_ctx where k = 'ev_' || name;
$$;

create function pg_temp.uid(who text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-00ca-0000000000' || case $1
    when 'A' then 'a1' when 'B' then 'a2' when 'C' then 'a3' when 'D' then 'a4'
    when 'E' then 'a5' when 'M' then 'b1' when 'S' then 'd1' end)::uuid;
$$;

-- Registers `who` for the named event the way the app does (an INSERT as that
-- user) and returns 'ok' or the error text. The exception block rolls back
-- just that insert, so a failure never poisons the test transaction.
create function pg_temp.try_register(event_name text, who text)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.uid(who), 'role', 'authenticated')::text, true);
  insert into public.event_registrations (event_id, user_id)
  values (pg_temp.ev(event_name), pg_temp.uid(who));
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

-- ---------------------------------------------------------------- setup (owner)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-00ca-0000000000a1', 'ca-a@test.local', '{"name":"Student A"}'),
  ('00000000-0000-0000-00ca-0000000000a2', 'ca-b@test.local', '{"name":"Student B"}'),
  ('00000000-0000-0000-00ca-0000000000a3', 'ca-c@test.local', '{"name":"Student C"}'),
  ('00000000-0000-0000-00ca-0000000000a4', 'ca-d@test.local', '{"name":"Student D"}'),
  ('00000000-0000-0000-00ca-0000000000a5', 'ca-e@test.local', '{"name":"Student E"}'),
  ('00000000-0000-0000-00ca-0000000000b1', 'ca-m@test.local', '{"name":"Manager M"}'),
  ('00000000-0000-0000-00ca-0000000000d1', 'ca-s@test.local', '{"name":"Super S"}');

-- The escalation trigger blocks role changes unless the caller is already a
-- super_admin, so promote with triggers bypassed.
set local session_replication_role = replica;
update public.users set role = 'super_admin' where id = pg_temp.uid('S');
set local session_replication_role = origin;

insert into public.clubs (id, name, slug, verified, created_by) values
  ('00000000-0000-0000-00ca-0000000000c1', 'Closing Club', 'closing-club', true, pg_temp.uid('M'));
-- handle_new_club makes M an approved admin of the club.

-- Every event starts out published (draft and cancelled are set below).
-- Names say what they test: dl_* has a registration_deadline; the rest rely
-- on the start_at default.
do $$
declare
  spec record;
  eid uuid;
begin
  for spec in
    select * from (values
      -- name,           start,                 end,                    deadline,               capacity
      ('fut',            interval '2 days',     interval '2 days 3 hours', null::interval,       null::int),
      ('fut_cap',        interval '2 days',     interval '2 days 3 hours', null::interval,       1),
      ('late_reg',       interval '2 days',     interval '2 days 3 hours', null::interval,       null),
      ('start_in_1s',    interval '1 second',   interval '3 hours',        null::interval,       null),
      ('start_now',      interval '0',          interval '3 hours',        null::interval,       null),
      ('started',        interval '-1 hour',    interval '2 hours',        null::interval,       null),
      ('ended',          interval '-3 hours',   interval '-1 hour',        null::interval,       null),
      -- explicit deadline wins over start_at, in both directions
      ('dl_before_start',interval '2 days',     interval '2 days 3 hours', interval '-1 hour',   null),
      ('dl_after_start', interval '-1 hour',    interval '2 hours',        interval '1 hour',    null),
      ('dl_future_late', interval '1 day',      interval '1 day 3 hours',  interval '1 day 1 hour', null),
      ('dl_passed_late', interval '-3 hours',   interval '2 hours',        interval '-1 hour',   null),
      ('dl_now',         interval '-1 hour',    interval '2 hours',        interval '0',         null),
      ('dl_at_end',      interval '-1 hour',    interval '2 hours',        interval '2 hours',   null),
      ('dl_1s_left',     interval '-1 hour',    interval '2 hours',        interval '1 second',  null),
      ('draft',          interval '2 days',     interval '2 days 3 hours', null::interval,       null),
      ('cancelled',      interval '2 days',     interval '2 days 3 hours', null::interval,       null)
    ) as s(name, start_offset, end_offset, deadline_offset, capacity)
  loop
    insert into public.events
      (club_id, title, slug, venue, start_at, end_at, registration_deadline, capacity, status, created_by)
    values ('00000000-0000-0000-00ca-0000000000c1', 'RC ' || spec.name,
            'rc-' || replace(spec.name, '_', '-'), 'Hall',
            now() + spec.start_offset, now() + spec.end_offset,
            now() + spec.deadline_offset, spec.capacity,
            'published', pg_temp.uid('M'))
    returning id into eid;
    insert into t_ctx values ('ev_' || spec.name, eid::text);
  end loop;
end $$;
update public.events set status = 'draft'     where id = pg_temp.ev('draft');
update public.events set status = 'cancelled' where id = pg_temp.ev('cancelled');

-- ------------------------------------------------ 1. default: closes at start_at
set local role authenticated;
do $$
begin
  perform pg_temp.ok('01 default: before start_at, no deadline, registration is open',
    pg_temp.try_register('fut', 'A') = 'ok');

  perform pg_temp.ok('02 default: one second before start_at, registration is still open',
    pg_temp.try_register('start_in_1s', 'A') = 'ok');

  perform pg_temp.ok('03 default: at exactly start_at, registration is closed',
    pg_temp.try_register('start_now', 'A') = 'registration is closed',
    pg_temp.try_register('start_now', 'A'));

  perform pg_temp.ok('04 default: after start_at, during the event, registration is closed',
    pg_temp.try_register('started', 'A') = 'registration is closed',
    pg_temp.try_register('started', 'A'));

  perform pg_temp.ok('05 default: after the event ended, registration is closed',
    pg_temp.try_register('ended', 'A') = 'registration is closed',
    pg_temp.try_register('ended', 'A'));

  perform pg_temp.ok('06 default: a student other than A is closed out too',
    pg_temp.try_register('started', 'B') = 'registration is closed');
end $$;

-- ------------------------------------------------ 2. explicit deadline wins
do $$
begin
  perform pg_temp.ok('07 deadline: before start_at and passed, registration is closed even though the event is in the future',
    pg_temp.try_register('dl_before_start', 'A') = 'registration is closed',
    pg_temp.try_register('dl_before_start', 'A'));

  perform pg_temp.ok('08 deadline: after start_at but still ahead, registration is open while the event is running',
    pg_temp.try_register('dl_after_start', 'A') = 'ok');

  perform pg_temp.ok('09 deadline: a future event with a later deadline is open',
    pg_temp.try_register('dl_future_late', 'A') = 'ok');

  perform pg_temp.ok('10 deadline: after start_at and the deadline has passed, registration is closed',
    pg_temp.try_register('dl_passed_late', 'A') = 'registration is closed',
    pg_temp.try_register('dl_passed_late', 'A'));

  perform pg_temp.ok('11 deadline: at exactly the deadline, registration is closed',
    pg_temp.try_register('dl_now', 'A') = 'registration is closed',
    pg_temp.try_register('dl_now', 'A'));

  perform pg_temp.ok('12 deadline: a deadline equal to end_at (still ahead) is open',
    pg_temp.try_register('dl_at_end', 'A') = 'ok');

  perform pg_temp.ok('13 deadline: one second before the deadline is open',
    pg_temp.try_register('dl_1s_left', 'A') = 'ok');
end $$;

-- ------------------------------------------------ 3. same rule for every role
do $$
begin
  perform pg_temp.ok('14 roles: the club manager cannot register after start either',
    pg_temp.try_register('started', 'M') = 'registration is closed',
    pg_temp.try_register('started', 'M'));

  perform pg_temp.ok('15 roles: a super_admin cannot register after start either',
    pg_temp.try_register('started', 'S') = 'registration is closed',
    pg_temp.try_register('started', 'S'));

  perform pg_temp.ok('16 roles: the manager can still register before start',
    pg_temp.try_register('fut', 'M') = 'ok');
end $$;

-- ------------------------------------------------ 4. other rules still hold
do $$
begin
  -- A draft is invisible to students under RLS, so the refusal may come from
  -- the policy instead of the trigger; either way it's refused.
  perform pg_temp.ok('17 status: a draft event is still refused',
    pg_temp.try_register('draft', 'A') <> 'ok');

  perform pg_temp.ok('18 status: a cancelled event is still refused',
    pg_temp.try_register('cancelled', 'A') <> 'ok');

  perform pg_temp.ok('19 capacity: the first registration for a capacity-1 event succeeds',
    pg_temp.try_register('fut_cap', 'A') = 'ok');

  perform pg_temp.ok('20 capacity: the second is still refused as full',
    pg_temp.try_register('fut_cap', 'B') = 'event is at capacity',
    pg_temp.try_register('fut_cap', 'B'));
end $$;

reset role;

-- The guard applies to the table owner too (no role is exempt).
do $$
declare msg text;
begin
  begin
    insert into public.event_registrations (event_id, user_id)
    values (pg_temp.ev('started'), pg_temp.uid('C'));
    msg := 'ok';
  exception when others then
    msg := sqlerrm;
  end;
  perform pg_temp.ok('21 owner: the table owner is refused after start as well',
    msg = 'registration is closed', msg);
end $$;

-- ------------------------------------------------ 5. existing registrations unaffected
-- B and C register for an event that starts in 2 days; then the event starts
-- (start moved to the past by the owner, the same as time passing).
set local role authenticated;
do $$
begin
  perform pg_temp.ok('22 setup: B registers for late_reg while it is in the future',
    pg_temp.try_register('late_reg', 'B') = 'ok');
  perform pg_temp.ok('23 setup: C registers for late_reg while it is in the future',
    pg_temp.try_register('late_reg', 'C') = 'ok');
end $$;
reset role;

do $$
declare n_before int; n_after int; tickets_before int; tickets_after int;
begin
  select count(*) into n_before from public.event_registrations where event_id = pg_temp.ev('late_reg');
  select count(*) into tickets_before from public.registration_tickets t
    join public.event_registrations r on r.id = t.registration_id where r.event_id = pg_temp.ev('late_reg');

  update public.events
     set start_at = now() - interval '1 hour', end_at = now() + interval '2 hours'
   where id = pg_temp.ev('late_reg');

  select count(*) into n_after from public.event_registrations where event_id = pg_temp.ev('late_reg');
  select count(*) into tickets_after from public.registration_tickets t
    join public.event_registrations r on r.id = t.registration_id where r.event_id = pg_temp.ev('late_reg');

  perform pg_temp.ok('24 existing: the event starting does not remove registrations',
    n_before = 2 and n_after = 2, n_before || ' -> ' || n_after);
  perform pg_temp.ok('25 existing: ...or their tickets',
    tickets_before = 2 and tickets_after = 2, tickets_before || ' -> ' || tickets_after);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('B'), 'role', 'authenticated')::text, true);
do $$
declare n_reg int; n_tok int;
begin
  select count(*) into n_reg from public.event_registrations where event_id = pg_temp.ev('late_reg');
  select count(*) into n_tok from public.registration_tickets;
  perform pg_temp.ok('26 existing: B still sees their own registration after the start',
    n_reg = 1, n_reg || ' visible');
  -- B also registered for nothing else, so exactly one ticket is readable.
  perform pg_temp.ok('27 existing: B still reads their own ticket after the start',
    n_tok = 1, n_tok || ' visible');
  perform pg_temp.ok('28 existing: B still sees a ticket through get_my_registrations()',
    exists (select 1 from public.get_my_registrations()
            where get_my_registrations.event_id = pg_temp.ev('late_reg')),
    'rpc empty');

  perform pg_temp.ok('29 existing: a new student (D) is refused on the same, now-started, event',
    pg_temp.try_register('late_reg', 'D') = 'registration is closed');
end $$;

-- A student can still cancel an existing registration after the start: the
-- guard only looks at inserts.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('C'), 'role', 'authenticated')::text, true);
do $$
declare n int;
begin
  delete from public.event_registrations
   where event_id = pg_temp.ev('late_reg') and user_id = pg_temp.uid('C');
  get diagnostics n = row_count;
  perform pg_temp.ok('30 existing: C can still cancel their registration after the start', n = 1, n || ' rows');
  -- ...and then cannot register again, because it is closed now.
  perform pg_temp.ok('31 existing: ...but cannot re-register afterwards',
    pg_temp.try_register('late_reg', 'C') = 'registration is closed');
end $$;
reset role;

-- A registration made when the guard was different (pre-migration data) is
-- just a row: moving the clock past start_at changes nothing about it.
do $$
declare n int;
begin
  update public.events set start_at = now() - interval '5 hours', end_at = now() - interval '1 hour'
   where id = pg_temp.ev('fut');
  select count(*) into n from public.event_registrations where event_id = pg_temp.ev('fut');
  perform pg_temp.ok('32 existing: ending the event keeps its registrations', n = 2, n || ' rows');
end $$;

-- ------------------------------------------------ 6. the deadline constraint
do $$
declare cons text;
begin
  perform pg_temp.ok('33 constraint: the old events_deadline_before_start is gone',
    not exists (select 1 from pg_constraint where conname = 'events_deadline_before_start'
                and conrelid = 'public.events'::regclass));
  select pg_get_constraintdef(oid) into cons from pg_constraint
   where conname = 'events_deadline_before_end' and conrelid = 'public.events'::regclass;
  perform pg_temp.ok('34 constraint: events_deadline_before_end exists, on registration_deadline <= event_effective_end(start_at, end_at)',
    cons like '%registration_deadline <= %event_effective_end(start_at, end_at)%'
    and exists (select 1 from pg_depend d join pg_constraint c on c.oid = d.objid
                 where c.conname = 'events_deadline_before_end' and c.conrelid = 'public.events'::regclass
                   and d.refobjid = 'public.event_effective_end(timestamptz,timestamptz)'::regprocedure),
    coalesce(cons, 'missing'));
  perform pg_temp.ok('35 constraint: it is validated for existing rows',
    (select convalidated from pg_constraint
      where conname = 'events_deadline_before_end' and conrelid = 'public.events'::regclass));
end $$;

-- As the club manager through RLS: the deadline can move up to end_at, not past it.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('M'), 'role', 'authenticated')::text, true);
do $$
declare n int;
begin
  update public.events set registration_deadline = start_at + interval '1 hour'
   where id = pg_temp.ev('dl_before_start');
  get diagnostics n = row_count;
  perform pg_temp.ok('36 constraint: a manager can set a deadline after start_at', n = 1, n || ' rows');

  update public.events set registration_deadline = end_at where id = pg_temp.ev('dl_before_start');
  get diagnostics n = row_count;
  perform pg_temp.ok('37 constraint: a deadline equal to end_at is accepted', n = 1, n || ' rows');

  begin
    update public.events set registration_deadline = end_at + interval '1 second'
     where id = pg_temp.ev('dl_before_start');
    perform pg_temp.ok('38 constraint: a deadline after end_at is refused', false, 'update succeeded');
  exception when check_violation then
    perform pg_temp.ok('38 constraint: a deadline after end_at is refused',
      sqlerrm like '%events_deadline_before_end%', sqlerrm);
  end;

  begin
    update public.events set end_at = registration_deadline - interval '1 second'
     where id = pg_temp.ev('dl_before_start');
    perform pg_temp.ok('39 constraint: moving end_at before the deadline is refused', false, 'update succeeded');
  exception when check_violation then
    perform pg_temp.ok('39 constraint: moving end_at before the deadline is refused', true, sqlerrm);
  end;

  update public.events set registration_deadline = null where id = pg_temp.ev('dl_before_start');
  get diagnostics n = row_count;
  perform pg_temp.ok('40 constraint: the deadline can be cleared (back to the start_at default)',
    n = 1, n || ' rows');
end $$;

do $$
begin
  begin
    insert into public.events (club_id, title, slug, venue, start_at, end_at, registration_deadline, status, created_by)
    values ('00000000-0000-0000-00ca-0000000000c1', 'Bad', 'rc-bad', 'Hall',
            now() + interval '1 day', now() + interval '1 day 2 hours',
            now() + interval '1 day 2 hours 1 second', 'draft', pg_temp.uid('M'));
    perform pg_temp.ok('41 constraint: inserting an event with a deadline after end_at is refused', false, 'insert succeeded');
  exception when check_violation then
    perform pg_temp.ok('41 constraint: inserting an event with a deadline after end_at is refused',
      sqlerrm like '%events_deadline_before_end%', sqlerrm);
  end;

  insert into public.events (club_id, title, slug, venue, start_at, end_at, registration_deadline, status, created_by)
  values ('00000000-0000-0000-00ca-0000000000c1', 'Good', 'rc-good', 'Hall',
          now() + interval '1 day', now() + interval '1 day 2 hours',
          now() + interval '1 day 1 hour', 'draft', pg_temp.uid('M'));
  perform pg_temp.ok('42 constraint: inserting an event with a deadline between start and end is accepted', true);
end $$;
reset role;

-- ------------------------------------------------ 7. the guard is still wired up
do $$
declare def text;
begin
  select pg_get_functiondef('public.enforce_registration_rules()'::regprocedure) into def;
  perform pg_temp.ok('43 wiring: the BEFORE INSERT trigger still points at enforce_registration_rules',
    exists (select 1 from pg_trigger t
             where t.tgrelid = 'public.event_registrations'::regclass
               and t.tgname = 'event_registrations_enforce_rules'
               and t.tgfoid = 'public.enforce_registration_rules()'::regprocedure
               and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and not t.tgisinternal));
  perform pg_temp.ok('44 wiring: the function is security definer with a pinned search_path',
    def like '%SECURITY DEFINER%' and def like '%search_path%', 'definition mismatch');
  perform pg_temp.ok('45 wiring: it still takes the row lock on the event',
    def ilike '%for update%');
  perform pg_temp.ok('46 wiring: the closing time is coalesce(deadline, start_at)',
    def ilike '%coalesce(target_event.registration_deadline, target_event.start_at)%', 'rule text changed');
end $$;

-- ------------------------------------------------ 8. effective end (end_at = start_at)
-- end_at is NOT NULL and end_at >= start_at, so "no separate end time" means
-- end_at = start_at. Such an event runs for 4 hours, for the deadline cap
-- exactly as for tickets and door check-in.
do $$
declare
  spec record;
  eid uuid;
begin
  for spec in
    select * from (values
      ('noend_future',  interval '1 day',  null::interval),
      ('noend_dl',      interval '-1 hour', interval '1 hour'),
      ('noend_nodl',    interval '-1 hour', null::interval)
    ) as s(name, start_offset, deadline_offset)
  loop
    insert into public.events
      (club_id, title, slug, venue, start_at, end_at, registration_deadline, status, created_by)
    values ('00000000-0000-0000-00ca-0000000000c1', 'RC ' || spec.name,
            'rc-' || replace(spec.name, '_', '-'), 'Hall',
            now() + spec.start_offset, now() + spec.start_offset,
            now() + spec.deadline_offset, 'published', pg_temp.uid('M'))
    returning id into eid;
    insert into t_ctx values ('ev_' || spec.name, eid::text);
  end loop;
end $$;

do $$
declare
  old_tz text := current_setting('timezone');
  t0 timestamptz := '2026-11-01 05:30:00+00';  -- 01:30 EDT, 30 min before New York's DST change
  in_utc timestamptz;
  in_ny timestamptz;
  fn record;
begin
  perform pg_temp.ok('47 effective end: end_at when it is after start_at',
    public.event_effective_end(t0, t0 + interval '90 minutes') = t0 + interval '90 minutes');
  perform pg_temp.ok('48 effective end: start_at + 4 h when end_at = start_at',
    public.event_effective_end(t0, t0) = '2026-11-01 09:30:00+00'::timestamptz);

  perform set_config('timezone', 'UTC', true);
  in_utc := public.event_effective_end(t0, t0);
  perform set_config('timezone', 'America/New_York', true);
  in_ny := public.event_effective_end(t0, t0);
  perform set_config('timezone', old_tz, true);
  perform pg_temp.ok('49 effective end: same instant whatever the session time zone (across a DST change)',
    in_utc = in_ny and extract(epoch from in_ny - t0) = 4 * 3600, in_utc || ' vs ' || in_ny);

  select p.provolatile, p.prosecdef, p.proconfig into fn
    from pg_proc p where p.oid = 'public.event_effective_end(timestamptz,timestamptz)'::regprocedure;
  perform pg_temp.ok('50 effective end: immutable, invoker, pinned search_path',
    fn.provolatile = 'i' and not fn.prosecdef and fn.proconfig @> array['search_path=""'],
    fn.provolatile::text || ' ' || fn.prosecdef::text || ' ' || coalesce(fn.proconfig::text, 'no config'));
  perform pg_temp.ok('51 effective end: authenticated can execute it (the CHECK runs as the writer), anon cannot',
    has_function_privilege('authenticated', 'public.event_effective_end(timestamptz,timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.event_effective_end(timestamptz,timestamptz)', 'execute'));
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('M'), 'role', 'authenticated')::text, true);
do $$
declare n int;
begin
  update public.events set registration_deadline = start_at + interval '4 hours'
   where id = pg_temp.ev('noend_future');
  get diagnostics n = row_count;
  perform pg_temp.ok('52 effective end: no end time, a manager can set the deadline to start + 4 h', n = 1, n || ' rows');

  begin
    update public.events set registration_deadline = start_at + interval '4 hours 1 second'
     where id = pg_temp.ev('noend_future');
    perform pg_temp.ok('53 effective end: no end time, a deadline past start + 4 h is refused', false, 'update succeeded');
  exception when check_violation then
    perform pg_temp.ok('53 effective end: no end time, a deadline past start + 4 h is refused',
      sqlerrm like '%events_deadline_before_end%', sqlerrm);
  end;

  -- Giving the event a real end time moves the cap to that end time.
  begin
    update public.events set end_at = start_at + interval '1 hour'
     where id = pg_temp.ev('noend_future');
    perform pg_temp.ok('54 effective end: adding an end before the existing deadline is refused', false, 'update succeeded');
  exception when check_violation then
    perform pg_temp.ok('54 effective end: adding an end before the existing deadline is refused', true, sqlerrm);
  end;
end $$;

do $$
begin
  perform pg_temp.ok('55 effective end: no end time, started, deadline ahead: a student can still register',
    pg_temp.try_register('noend_dl', 'E') = 'ok', pg_temp.try_register('noend_dl', 'E'));
  perform pg_temp.ok('56 effective end: no end time, started, no deadline: registration is closed',
    pg_temp.try_register('noend_nodl', 'E') = 'registration is closed', pg_temp.try_register('noend_nodl', 'E'));
end $$;
reset role;

do $$
declare def text;
begin
  select pg_get_functiondef('public.check_in_gate(uuid,uuid)'::regprocedure) into def;
  perform pg_temp.ok('57 one rule: check_in_gate takes its effective end from event_effective_end',
    def like '%public.event_effective_end(v_event.start_at, v_event.end_at)%'
    and def not like '%interval ''4 hours''%', 'inline copy still present or call missing');
  perform pg_temp.ok('58 one rule: check_in_gate is still not executable by any API role',
    not has_function_privilege('anon', 'public.check_in_gate(uuid,uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.check_in_gate(uuid,uuid)', 'execute'));
  perform pg_temp.ok('59 one rule: no other function in public inlines the 4-hour fallback',
    not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                 where ns.nspname = 'public'
                   and p.oid <> 'public.event_effective_end(timestamptz,timestamptz)'::regprocedure
                   and p.prosrc like '%interval ''4 hours''%'),
    (select string_agg(p.proname, ', ') from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public'
        and p.oid <> 'public.event_effective_end(timestamptz,timestamptz)'::regprocedure
        and p.prosrc like '%interval ''4 hours''%'));
end $$;

-- ---------------------------------------------------------------- report
select n, case when pass then 'PASS' else 'FAIL' end as result, name, detail
from t_results order by n;

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed
from t_results;

rollback;
