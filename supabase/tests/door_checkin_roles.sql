-- Role tests for 20260830000001_door_checkin.sql.
-- Runs entirely inside one transaction and ends in ROLLBACK: nothing persists.
-- LOCAL STACK ONLY. Never run against the live project.
--
--   docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/door_checkin_roles.sql
--
-- Every row of the final report should say PASS. Concurrent scans are tested
-- separately in door_checkin_concurrency.sql.
--
-- Actors: A, B, C, D = students; M = admin of club 1; M3 = coordinator of
--         club 1; M2 = admin of club 2; S = super_admin; anon.
-- A user is simulated with SET LOCAL ROLE authenticated + a request.jwt.claims
-- `sub`, which is what auth.uid() reads. now() is fixed for the whole
-- transaction, so every window below is relative to it.

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
create function pg_temp.uid(who text) returns uuid language sql stable as $$
  select v::uuid from t_ctx where k = 'uid_' || who;
$$;
create function pg_temp.ev(name text) returns uuid language sql stable as $$
  select v::uuid from t_ctx where k = 'ev_' || name;
$$;
create function pg_temp.reg(key text) returns uuid language sql stable as $$
  select v::uuid from t_ctx where k = 'reg_' || key;
$$;
create function pg_temp.tok(key text) returns text language sql stable as $$
  select v from t_ctx where k = 'tok_' || key;
$$;

-- Reads a registration's check-in fields as the owner (security definer, so
-- RLS can't hide the row from whoever is acting and make a check pass
-- vacuously).
create function pg_temp.row_state(rid uuid)
returns table (checked_in_at timestamptz, checked_in_by uuid, check_in_method text)
language sql stable security definer as $$
  select r.checked_in_at, r.checked_in_by, r.check_in_method::text
  from public.event_registrations r where r.id = rid;
$$;

-- ---------------------------------------------------------------- setup (owner)
insert into t_ctx values
  ('uid_A',  '00000000-0000-0000-00dc-0000000000a1'),
  ('uid_B',  '00000000-0000-0000-00dc-0000000000a2'),
  ('uid_C',  '00000000-0000-0000-00dc-0000000000a3'),
  ('uid_D',  '00000000-0000-0000-00dc-0000000000a4'),
  ('uid_M',  '00000000-0000-0000-00dc-0000000000b1'),
  ('uid_M2', '00000000-0000-0000-00dc-0000000000b2'),
  ('uid_M3', '00000000-0000-0000-00dc-0000000000b3'),
  ('uid_S',  '00000000-0000-0000-00dc-0000000000b4'),
  ('club1',  '00000000-0000-0000-00dc-0000000000c1'),
  ('club2',  '00000000-0000-0000-00dc-0000000000c2');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-00dc-0000000000a1', 'dc-a@test.local', '{"name":"Student A"}'),
  ('00000000-0000-0000-00dc-0000000000a2', 'dc-b@test.local', '{"name":"Student B"}'),
  ('00000000-0000-0000-00dc-0000000000a3', 'dc-c@test.local', '{"name":"Student C"}'),
  ('00000000-0000-0000-00dc-0000000000a4', 'dc-d@test.local', '{"name":"Student D"}'),
  ('00000000-0000-0000-00dc-0000000000b1', 'dc-m@test.local', '{"name":"Manager M"}'),
  ('00000000-0000-0000-00dc-0000000000b2', 'dc-m2@test.local', '{"name":"Manager M2"}'),
  ('00000000-0000-0000-00dc-0000000000b3', 'dc-m3@test.local', '{"name":"Coordinator M3"}'),
  ('00000000-0000-0000-00dc-0000000000b4', 'dc-s@test.local', '{"name":"Super S"}');

-- Same bootstrap as README: the escalation trigger blocks role changes unless
-- the caller is already a super_admin, so promote with triggers bypassed.
set local session_replication_role = replica;
update public.users set role = 'super_admin' where id = '00000000-0000-0000-00dc-0000000000b4';
set local session_replication_role = origin;

-- handle_new_club makes each creator an approved admin of their club.
insert into public.clubs (id, name, slug, verified, created_by) values
  ('00000000-0000-0000-00dc-0000000000c1', 'DC Club One', 'dc-club-one', true, '00000000-0000-0000-00dc-0000000000b1'),
  ('00000000-0000-0000-00dc-0000000000c2', 'DC Club Two', 'dc-club-two', true, '00000000-0000-0000-00dc-0000000000b2');
insert into public.club_members (club_id, user_id, role, status) values
  ('00000000-0000-0000-00dc-0000000000c1', '00000000-0000-0000-00dc-0000000000b3', 'coordinator', 'approved');

-- Events are created published so students can register, then moved to
-- their test status. The window opens 2 h before start and closes 1 h after
-- the effective end (end_at, or start + 4 h when end_at = start_at).
--
-- Registration closes at start_at (20260831000001), so an event that has
-- already started can't be registered for. Every event is therefore created
-- starting tomorrow, registered, and only then moved to its real times
-- (below, after the registrations).
create temp table t_event_spec (name text primary key, club text, start_offset interval, end_offset interval);
grant all on t_event_spec to public;
insert into t_event_spec
    select * from (values
      ('in',         'club1', interval '1 hour',               interval '3 hours'),
      ('in2',        'club1', interval '30 minutes',           interval '2 hours'),
      ('cxl',        'club1', interval '1 hour',               interval '3 hours'),
      ('draft',      'club1', interval '1 hour',               interval '3 hours'),
      ('early',      'club1', interval '5 hours',              interval '7 hours'),
      ('ended',      'club1', interval '-6 hours',             interval '-2 hours'),
      ('done',       'club1', interval '1 hour',               interval '3 hours'),
      -- Both parts negative: '-3 hours 30 minutes' would mean -2 h 30 min.
      ('noend',      'club1', interval '-3 hours -30 minutes', interval '-3 hours -30 minutes'),
      ('noend_over', 'club1', interval '-5 hours -30 minutes', interval '-5 hours -30 minutes'),
      ('other',      'club2', interval '1 hour',               interval '3 hours'),
      ('edge_open',  'club1', interval '2 hours',              interval '4 hours'),
      ('edge_early', 'club1', interval '2 hours 1 second',     interval '4 hours'),
      ('edge_close', 'club1', interval '-4 hours',             interval '-1 hour'),
      ('edge_late',  'club1', interval '-4 hours',             interval '-1 hour -1 second')
    ) as s(name, club, start_offset, end_offset);

do $$
declare
  spec record;
  eid uuid;
begin
  for spec in select * from t_event_spec loop
    insert into public.events (club_id, title, slug, venue, start_at, end_at, status, created_by)
    values (pg_temp.ctx(spec.club)::uuid, 'DC ' || spec.name, 'dc-' || replace(spec.name, '_', '-'), 'Hall',
            now() + interval '1 day', now() + interval '1 day 1 hour', 'published',
            case spec.club when 'club1' then pg_temp.uid('M') else pg_temp.uid('M2') end)
    returning id into eid;
    insert into t_ctx values ('ev_' || spec.name, eid::text);
  end loop;
end $$;

-- Registrations go through the real triggers (rules, ticket code, ticket).
do $$
declare
  pair record;
  rid uuid;
begin
  for pair in
    select * from (values
      ('in', 'A'), ('in', 'B'), ('in', 'C'), ('in', 'D'),
      ('in2', 'A'), ('in2', 'C'),
      ('cxl', 'A'), ('draft', 'A'), ('early', 'A'), ('ended', 'A'), ('done', 'A'),
      ('noend', 'A'), ('noend_over', 'A'), ('other', 'A')
    ) as p(ev, who)
  loop
    insert into public.event_registrations (event_id, user_id)
    values (pg_temp.ev(pair.ev), pg_temp.uid(pair.who))
    returning id into rid;
    insert into t_ctx values ('reg_' || pair.ev || '_' || pair.who, rid::text);
    insert into t_ctx
      select 'tok_' || pair.ev || '_' || pair.who, t.token
      from public.registration_tickets t where t.registration_id = rid;
  end loop;
end $$;

-- Move every event to its real times now that the registrations exist.
-- (now() is fixed inside the transaction, so the offsets are exact.)
update public.events e
   set start_at = now() + s.start_offset,
       end_at   = now() + s.end_offset
  from t_event_spec s
 where e.id = pg_temp.ev(s.name);

update public.events set status = 'cancelled' where id = pg_temp.ev('cxl');
update public.events set status = 'draft'     where id = pg_temp.ev('draft');
update public.events set status = 'completed' where id = pg_temp.ev('done');

-- ---------------------------------------------------------------- 1. scanning (M)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b1","role":"authenticated"}', true);
do $$
declare r record; s record;
begin
  select * into r from public.check_in_by_token(pg_temp.ev('in'), pg_temp.tok('in_A'));
  perform pg_temp.ok('01 scan: valid ticket checks in, with the name',
    r.outcome = 'checked_in' and r.attendee_name = 'Student A'
      and r.registration_id = pg_temp.reg('in_A') and r.checked_in_at = now(),
    format('%s / %s', r.outcome, r.attendee_name));

  select * into s from pg_temp.row_state(pg_temp.reg('in_A'));
  perform pg_temp.ok('02 scan: records who checked in and how (scan)',
    s.checked_in_at = now() and s.checked_in_by = pg_temp.uid('M') and s.check_in_method = 'scan',
    format('by %s, %s', s.checked_in_by, s.check_in_method));
end $$;
reset role;

-- Backdate A's check-in (as the owner, through the flag) so a duplicate scan
-- in this same transaction is distinguishable from a fresh one.
do $$
begin
  perform set_config('sabha.check_in_rpc', 'on', true);
  update public.event_registrations set checked_in_at = now() - interval '10 minutes'
  where id = pg_temp.reg('in_A');
  perform set_config('sabha.check_in_rpc', 'off', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b1","role":"authenticated"}', true);
do $$
declare r record; s record;
begin
  select * into r from public.check_in_by_token(pg_temp.ev('in'), pg_temp.tok('in_A'));
  perform pg_temp.ok('03 scan: duplicate scan says already checked in, with the original time',
    r.outcome = 'already_checked_in' and r.attendee_name = 'Student A'
      and r.checked_in_at = now() - interval '10 minutes',
    format('%s at %s', r.outcome, r.checked_in_at));
  select * into s from pg_temp.row_state(pg_temp.reg('in_A'));
  perform pg_temp.ok('04 scan: duplicate scan leaves the row unchanged',
    s.checked_in_at = now() - interval '10 minutes' and s.checked_in_by = pg_temp.uid('M'),
    s.checked_in_at::text);

  select * into r from public.check_in_by_token(pg_temp.ev('in'), E'  ' || lower(pg_temp.tok('in_B')) || E'\r\n');
  perform pg_temp.ok('05 scan: lowercase token with spaces and newline is accepted',
    r.outcome = 'checked_in' and r.attendee_name = 'Student B', r.outcome);

  select * into r from public.check_in_by_token(pg_temp.ev('in'), pg_temp.tok('in2_A'));
  perform pg_temp.ok('06 scan: ticket for another event is wrong_event, with no name or id',
    r.outcome = 'wrong_event' and r.attendee_name is null and r.registration_id is null,
    format('%s / %s', r.outcome, r.attendee_name));
  select * into s from pg_temp.row_state(pg_temp.reg('in2_A'));
  perform pg_temp.ok('07 scan: wrong_event leaves that registration untouched',
    s.checked_in_at is null and s.checked_in_by is null, coalesce(s.checked_in_at::text, 'null'));

  select * into r from public.check_in_by_token(pg_temp.ev('in'), repeat('AB', 16));
  perform pg_temp.ok('08 scan: unknown well-formed token is invalid_token', r.outcome = 'invalid_token', r.outcome);
  select * into r from public.check_in_by_token(pg_temp.ev('in'), 'https://example.com/not-a-ticket');
  perform pg_temp.ok('09 scan: malformed token is invalid_token', r.outcome = 'invalid_token', r.outcome);
  select * into r from public.check_in_by_token(pg_temp.ev('in'), null);
  perform pg_temp.ok('10 scan: NULL token is invalid_token', r.outcome = 'invalid_token', r.outcome);
end $$;

-- ---------------------------------------------------------------- 2. event and registration states (M)
-- C cancels (deletes) their own not-yet-checked-in registration for in2.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000a3","role":"authenticated"}', true);
do $$
declare n int;
begin
  delete from public.event_registrations where id = pg_temp.reg('in2_C');
  get diagnostics n = row_count;
  insert into t_ctx values ('c_cancel_rows', n::text);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b1","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.check_in_by_token(pg_temp.ev('cxl'), pg_temp.tok('cxl_A'));
  perform pg_temp.ok('11 state: cancelled event', r.outcome = 'event_cancelled', r.outcome);
  select * into r from public.check_in_by_token(pg_temp.ev('in2'), pg_temp.tok('in2_C'));
  perform pg_temp.ok('12 state: cancelled (deleted) registration is invalid_token', r.outcome = 'invalid_token', r.outcome);
  select * into r from public.check_in_by_token(pg_temp.ev('draft'), pg_temp.tok('draft_A'));
  perform pg_temp.ok('13 state: draft event', r.outcome = 'event_not_published', r.outcome);
  select * into r from public.check_in_by_token(pg_temp.ev('early'), pg_temp.tok('early_A'));
  perform pg_temp.ok('14 state: more than 2 h before start is too_early', r.outcome = 'too_early', r.outcome);
  select * into r from public.check_in_by_token(pg_temp.ev('ended'), pg_temp.tok('ended_A'));
  perform pg_temp.ok('15 state: more than 1 h after end is event_ended', r.outcome = 'event_ended', r.outcome);
  select * into r from public.check_in_by_token(pg_temp.ev('done'), pg_temp.tok('done_A'));
  perform pg_temp.ok('16 state: completed event is event_ended', r.outcome = 'event_ended', r.outcome);
  select * into r from public.check_in_by_token(pg_temp.ev('noend'), pg_temp.tok('noend_A'));
  perform pg_temp.ok('17 state: end = start, still within start + 4 h + 1 h', r.outcome = 'checked_in', r.outcome);
  select * into r from public.check_in_by_token(pg_temp.ev('noend_over'), pg_temp.tok('noend_over_A'));
  perform pg_temp.ok('18 state: end = start, past start + 4 h + 1 h', r.outcome = 'event_ended', r.outcome);
end $$;
reset role;

-- Window edges, through the gate directly (the owner may call it).
do $$
declare m uuid := pg_temp.uid('M');
begin
  perform pg_temp.ok('19 window: opens exactly 2 h before start',
    public.check_in_gate(pg_temp.ev('edge_open'), m) is null,
    coalesce(public.check_in_gate(pg_temp.ev('edge_open'), m), 'null'));
  perform pg_temp.ok('20 window: 1 s before that is too_early',
    public.check_in_gate(pg_temp.ev('edge_early'), m) = 'too_early',
    coalesce(public.check_in_gate(pg_temp.ev('edge_early'), m), 'null'));
  perform pg_temp.ok('21 window: still open exactly 1 h after end',
    public.check_in_gate(pg_temp.ev('edge_close'), m) is null,
    coalesce(public.check_in_gate(pg_temp.ev('edge_close'), m), 'null'));
  perform pg_temp.ok('22 window: 1 s after that is event_ended',
    public.check_in_gate(pg_temp.ev('edge_late'), m) = 'event_ended',
    coalesce(public.check_in_gate(pg_temp.ev('edge_late'), m), 'null'));
end $$;

-- ---------------------------------------------------------------- 3. authorization
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b2","role":"authenticated"}', true);
do $$
declare r record; s record;
begin
  select * into r from public.check_in_by_token(pg_temp.ev('in2'), pg_temp.tok('in2_A'));
  perform pg_temp.ok('23 authz: manager of another club is not_authorized, learns no name',
    r.outcome = 'not_authorized' and r.attendee_name is null and r.registration_id is null,
    format('%s / %s', r.outcome, r.attendee_name));
  select * into s from pg_temp.row_state(pg_temp.reg('in2_A'));
  perform pg_temp.ok('24 authz: ...and the registration is untouched', s.checked_in_at is null, '');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000a1","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.check_in_by_token(pg_temp.ev('in2'), pg_temp.tok('in2_A'));
  perform pg_temp.ok('25 authz: a student can''t check themselves in', r.outcome = 'not_authorized', r.outcome);
end $$;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.check_in_by_token(pg_temp.ev('in2'), pg_temp.tok('in2_A'));
  perform pg_temp.ok('26 authz: authenticated with no user id is not_authorized', r.outcome = 'not_authorized', r.outcome);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b1","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.check_in_by_token(gen_random_uuid(), pg_temp.tok('in2_A'));
  perform pg_temp.ok('27 authz: unknown event id is not_authorized (no existence oracle)', r.outcome = 'not_authorized', r.outcome);
  select * into r from public.check_in_by_token(pg_temp.ev('other'), pg_temp.tok('other_A'));
  perform pg_temp.ok('28 authz: club 1 manager can''t check in at a club 2 event', r.outcome = 'not_authorized', r.outcome);
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare denied int := 0;
begin
  begin perform * from public.check_in_by_token(gen_random_uuid(), 'x');
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform * from public.manual_check_in(gen_random_uuid());
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform * from public.undo_check_in(gen_random_uuid());
  exception when insufficient_privilege then denied := denied + 1; end;
  begin perform * from public.get_event_check_in_list(gen_random_uuid());
  exception when insufficient_privilege then denied := denied + 1; end;
  perform pg_temp.ok('29 authz: anon is denied all 4 RPCs', denied = 4, denied || ' of 4 denied');
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b4","role":"authenticated"}', true);
do $$
declare r record; s record;
begin
  select * into r from public.check_in_by_token(pg_temp.ev('in2'), pg_temp.tok('in2_A'));
  select * into s from pg_temp.row_state(pg_temp.reg('in2_A'));
  perform pg_temp.ok('30 authz: super_admin can check in at any club''s event',
    r.outcome = 'checked_in' and s.checked_in_by = pg_temp.uid('S'), r.outcome);
end $$;

-- ---------------------------------------------------------------- 4. manual check-in and undo
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b1","role":"authenticated"}', true);
do $$
declare r record; r2 record; s record;
begin
  select * into r from public.manual_check_in(pg_temp.reg('in_C'));
  select * into s from pg_temp.row_state(pg_temp.reg('in_C'));
  perform pg_temp.ok('31 manual: checks in by registration, method manual',
    r.outcome = 'checked_in' and r.attendee_name = 'Student C'
      and s.check_in_method = 'manual' and s.checked_in_by = pg_temp.uid('M'),
    format('%s / %s', r.outcome, s.check_in_method));

  select * into r2 from public.manual_check_in(pg_temp.reg('in_C'));
  perform pg_temp.ok('32 manual: repeat is already_checked_in with the same time',
    r2.outcome = 'already_checked_in' and r2.checked_in_at = r.checked_in_at, r2.outcome);

  select * into r from public.manual_check_in(gen_random_uuid());
  perform pg_temp.ok('33 manual: unknown registration id is not_authorized', r.outcome = 'not_authorized', r.outcome);

  select * into r from public.manual_check_in(pg_temp.reg('cxl_A'));
  perform pg_temp.ok('34 manual: cancelled event', r.outcome = 'event_cancelled', r.outcome);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b2","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.manual_check_in(pg_temp.reg('in_D'));
  perform pg_temp.ok('35 manual: manager of another club is not_authorized', r.outcome = 'not_authorized', r.outcome);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000a4","role":"authenticated"}', true);
do $$
declare r record; s record;
begin
  select * into r from public.manual_check_in(pg_temp.reg('in_D'));
  select * into s from pg_temp.row_state(pg_temp.reg('in_D'));
  perform pg_temp.ok('36 manual: a student can''t check themselves in',
    r.outcome = 'not_authorized' and s.checked_in_at is null, r.outcome);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b1","role":"authenticated"}', true);
do $$
declare r record; s record;
begin
  select * into r from public.undo_check_in(pg_temp.reg('in_C'));
  select * into s from pg_temp.row_state(pg_temp.reg('in_C'));
  perform pg_temp.ok('37 undo: clears time, checker and method',
    r.outcome = 'undone' and r.attendee_name = 'Student C'
      and s.checked_in_at is null and s.checked_in_by is null and s.check_in_method is null,
    r.outcome);

  select * into r from public.undo_check_in(pg_temp.reg('in_C'));
  perform pg_temp.ok('38 undo: repeat is not_checked_in', r.outcome = 'not_checked_in', r.outcome);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b2","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.undo_check_in(pg_temp.reg('in_B'));
  perform pg_temp.ok('39 undo: manager of another club is not_authorized', r.outcome = 'not_authorized', r.outcome);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000a2","role":"authenticated"}', true);
do $$
declare r record; s record;
begin
  select * into r from public.undo_check_in(pg_temp.reg('in_B'));
  select * into s from pg_temp.row_state(pg_temp.reg('in_B'));
  perform pg_temp.ok('40 undo: a student can''t undo their own check-in',
    r.outcome = 'not_authorized' and s.checked_in_at is not null, r.outcome);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b1","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.check_in_by_token(pg_temp.ev('in'), pg_temp.tok('in_C'));
  perform pg_temp.ok('41 undo: the ticket scans again afterwards', r.outcome = 'checked_in', r.outcome);
end $$;

-- ---------------------------------------------------------------- 5. direct writes are blocked
do $$
declare col text;
begin
  foreach col in array array['checked_in_at', 'checked_in_by', 'check_in_method'] loop
    begin
      execute format(
        'update public.event_registrations set %I = %s where id = %L',
        col,
        case col when 'checked_in_at' then 'now()'
                 when 'checked_in_by' then quote_literal(pg_temp.uid('M'))
                 else quote_literal('manual') end,
        pg_temp.reg('in_D'));
      perform pg_temp.ok('42 direct: manager can''t UPDATE ' || col, false, 'update succeeded');
    exception when raise_exception then
      perform pg_temp.ok('42 direct: manager can''t UPDATE ' || col,
        sqlerrm = 'check-in can only change through the door check-in functions', sqlerrm);
    end;
  end loop;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b4","role":"authenticated"}', true);
do $$
begin
  update public.event_registrations set checked_in_at = now() where id = pg_temp.reg('in_D');
  perform pg_temp.ok('43 direct: super_admin can''t UPDATE checked_in_at', false, 'update succeeded');
exception when raise_exception then
  perform pg_temp.ok('43 direct: super_admin can''t UPDATE checked_in_at',
    sqlerrm = 'check-in can only change through the door check-in functions', sqlerrm);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000a4","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.event_registrations set checked_in_at = now() where id = pg_temp.reg('in_D');
  get diagnostics n = row_count;
  perform pg_temp.ok('44 direct: a student''s UPDATE of their own row touches 0 rows (RLS)', n = 0, n || ' rows');
end $$;

-- Hole 1: registering yourself as already checked in.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000a2","role":"authenticated"}', true);
do $$
begin
  insert into public.event_registrations (event_id, user_id, checked_in_at)
  values (pg_temp.ev('in2'), auth.uid(), now());
  perform pg_temp.ok('45 direct: student can''t register as already checked in', false, 'insert succeeded');
exception when raise_exception then
  perform pg_temp.ok('45 direct: student can''t register as already checked in',
    sqlerrm = 'check-in fields cannot be set when registering', sqlerrm);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000a4","role":"authenticated"}', true);
do $$
begin
  insert into public.event_registrations (event_id, user_id, check_in_method)
  values (pg_temp.ev('in2'), auth.uid(), 'manual');
  perform pg_temp.ok('46 direct: student can''t register with a check-in method', false, 'insert succeeded');
exception when raise_exception then
  perform pg_temp.ok('46 direct: student can''t register with a check-in method',
    sqlerrm = 'check-in fields cannot be set when registering', sqlerrm);
end $$;

-- Hole 2: moving a registration.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b1","role":"authenticated"}', true);
do $$
declare n int;
begin
  begin
    update public.event_registrations set event_id = pg_temp.ev('in2') where id = pg_temp.reg('in_B');
    perform pg_temp.ok('47 direct: manager can''t move a registration to another event', false, 'update succeeded');
  exception when raise_exception then
    perform pg_temp.ok('47 direct: manager can''t move a registration to another event',
      sqlerrm = 'a registration cannot be moved to another event or person', sqlerrm);
  end;

  begin
    update public.event_registrations set user_id = pg_temp.uid('D') where id = pg_temp.reg('in_B');
    perform pg_temp.ok('48 direct: manager can''t move a registration to another person', false, 'update succeeded');
  exception when raise_exception then
    perform pg_temp.ok('48 direct: manager can''t move a registration to another person',
      sqlerrm = 'a registration cannot be moved to another event or person', sqlerrm);
  end;

  update public.event_registrations set registered_at = registered_at - interval '1 minute'
  where id = pg_temp.reg('in_B');
  get diagnostics n = row_count;
  perform pg_temp.ok('49 direct: other manager updates still pass (registered_at)', n = 1, n || ' rows');
end $$;
reset role;

set local role service_role;
do $$
begin
  update public.event_registrations set checked_in_at = now() where id = pg_temp.reg('in_D');
  perform pg_temp.ok('50 direct: service_role can''t UPDATE checked_in_at', false, 'update succeeded');
exception when raise_exception then
  perform pg_temp.ok('50 direct: service_role can''t UPDATE checked_in_at',
    sqlerrm = 'check-in can only change through the door check-in functions', sqlerrm);
end $$;
reset role;

do $$
begin
  update public.event_registrations set checked_in_at = now() where id = pg_temp.reg('in_D');
  perform pg_temp.ok('51 direct: owner role without the RPC flag can''t UPDATE checked_in_at', false, 'update succeeded');
exception when raise_exception then
  perform pg_temp.ok('51 direct: owner role without the RPC flag can''t UPDATE checked_in_at',
    sqlerrm = 'check-in can only change through the door check-in functions', sqlerrm);
end $$;

do $$
begin
  perform pg_temp.ok('52 direct: event_registrations policies unchanged',
    (select array_agg(policyname::text order by policyname) from pg_policies
       where schemaname = 'public' and tablename = 'event_registrations')
    = array['event_registrations_delete_self_or_manager',
            'event_registrations_insert_self',
            'event_registrations_select_self_or_manager',
            'event_registrations_update_manager'],
    '');
end $$;

-- ---------------------------------------------------------------- 6. deleting the checker's account
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b3","role":"authenticated"}', true);
do $$
declare r record;
begin
  select * into r from public.check_in_by_token(pg_temp.ev('in'), pg_temp.tok('in_D'));
  perform pg_temp.ok('53 coordinator (not just admin) can check in', r.outcome = 'checked_in', r.outcome);
end $$;
reset role;

-- Deleted as service_role: the ON DELETE SET NULL action runs as the table
-- owner, so the guard's exemption applies even when an API role deletes.
set local role service_role;
delete from public.users where id = '00000000-0000-0000-00dc-0000000000b3';
reset role;
do $$
declare s record;
begin
  select * into s from pg_temp.row_state(pg_temp.reg('in_D'));
  perform pg_temp.ok('54 deleting the checker''s account keeps the check-in, drops checked_in_by',
    s.checked_in_at = now() and s.checked_in_by is null and s.check_in_method = 'scan',
    format('at %s, by %s, %s', s.checked_in_at, coalesce(s.checked_in_by::text, 'null'), s.check_in_method));
end $$;

-- ---------------------------------------------------------------- 7. delete guard
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000a1","role":"authenticated"}', true);
do $$
declare n int;
begin
  begin
    delete from public.event_registrations where id = pg_temp.reg('in_A');
    perform pg_temp.ok('55 delete: student can''t cancel a checked-in registration', false, 'delete succeeded');
  exception when raise_exception then
    perform pg_temp.ok('55 delete: student can''t cancel a checked-in registration',
      sqlerrm = 'a checked-in registration cannot be cancelled', sqlerrm);
  end;

  delete from public.event_registrations where id = pg_temp.reg('early_A');
  get diagnostics n = row_count;
  perform pg_temp.ok('56 delete: student can still cancel a registration that isn''t checked in',
    n = 1 and pg_temp.ctx('c_cancel_rows') = '1', n || ' rows (and C''s earlier cancel: ' || pg_temp.ctx('c_cancel_rows') || ')');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b1","role":"authenticated"}', true);
do $$
declare n int;
begin
  delete from public.event_registrations where id = pg_temp.reg('in_B');
  get diagnostics n = row_count;
  perform pg_temp.ok('57 delete: manager can remove a checked-in registration', n = 1, n || ' rows');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b4","role":"authenticated"}', true);
do $$
declare n int;
begin
  delete from public.event_registrations where id = pg_temp.reg('in2_A');
  get diagnostics n = row_count;
  perform pg_temp.ok('58 delete: super_admin can remove a checked-in registration', n = 1, n || ' rows');
end $$;
reset role;

-- Cascades pass even when the claims carry the registrant's own id.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000a3","role":"authenticated"}', true);
delete from auth.users where id = '00000000-0000-0000-00dc-0000000000a3';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000a1","role":"authenticated"}', true);
delete from public.events where id = pg_temp.ev('noend');
select set_config('request.jwt.claims', '', true);
do $$
declare n_c int; n_ev int;
begin
  select count(*) into n_c from public.event_registrations where user_id = pg_temp.uid('C');
  select count(*) into n_ev from public.event_registrations where id = pg_temp.reg('noend_A');
  perform pg_temp.ok('59 delete: deleting a checked-in student''s account still cascades', n_c = 0, n_c || ' rows left');
  perform pg_temp.ok('60 delete: deleting an event still cascades its checked-in registrations', n_ev = 0, n_ev || ' rows left');
end $$;

-- ---------------------------------------------------------------- 8. constraint, functions, grants
do $$
begin
  perform set_config('sabha.check_in_rpc', 'on', true);
  begin
    update public.event_registrations set checked_in_by = pg_temp.uid('M')
    where id = pg_temp.reg('cxl_A');
    perform pg_temp.ok('61 CHECK: checker or method without a check-in time is rejected', false, 'update succeeded');
  exception when check_violation then
    perform pg_temp.ok('61 CHECK: checker or method without a check-in time is rejected', true, sqlerrm);
  end;

  update public.event_registrations set checked_in_at = now() where id = pg_temp.reg('cxl_A');
  perform pg_temp.ok('62 CHECK: a time-only (pre-migration style) check-in is allowed', true, '');
  perform set_config('sabha.check_in_rpc', 'off', true);
end $$;

do $$
declare
  fn text;
  bad text := '';
begin
  foreach fn in array array[
    'public.check_in_by_token(uuid,text)', 'public.manual_check_in(uuid)',
    'public.undo_check_in(uuid)', 'public.get_event_check_in_list(uuid)',
    'public.guard_checked_in_registration_delete()'
  ] loop
    if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = to_regprocedure(fn)) then
      bad := bad || fn || ' ';
    end if;
  end loop;
  foreach fn in array array['public.check_in_gate(uuid,uuid)', 'public.guard_registration_check_in()'] loop
    if not (select not prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = to_regprocedure(fn)) then
      bad := bad || fn || ' ';
    end if;
  end loop;
  perform pg_temp.ok('63 functions: definer/invoker as designed, search_path pinned to ''''', bad = '', coalesce(nullif(bad, ''), 'all ok'));

  bad := '';
  foreach fn in array array['public.check_in_by_token(uuid,text)', 'public.manual_check_in(uuid)',
                            'public.undo_check_in(uuid)', 'public.get_event_check_in_list(uuid)'] loop
    if has_function_privilege('anon', fn, 'execute') or not has_function_privilege('authenticated', fn, 'execute')
       or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                  where p.oid = to_regprocedure(fn) and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      bad := bad || fn || ' ';
    end if;
  end loop;
  if has_function_privilege('anon', 'public.check_in_gate(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.check_in_gate(uuid,uuid)', 'execute')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid = to_regprocedure('public.check_in_gate(uuid,uuid)') and a.grantee = 0) then
    bad := bad || 'check_in_gate ';
  end if;
  perform pg_temp.ok('64 grants: RPCs authenticated-only; gate callable by no API role', bad = '', coalesce(nullif(bad, ''), 'all ok'));

  bad := '';
  foreach fn in array array['public.check_in_by_token(uuid,text)', 'public.manual_check_in(uuid)',
                            'public.undo_check_in(uuid)', 'public.get_event_check_in_list(uuid)'] loop
    if pg_get_function_result(to_regprocedure(fn)) ~* '(token|ticket_code|email|user_id|roll)' then
      bad := bad || fn || ' ';
    end if;
  end loop;
  perform pg_temp.ok('65 RPC results have no token, ticket_code, email, user_id or roll number', bad = '', coalesce(nullif(bad, ''), 'all ok'));
end $$;

-- ---------------------------------------------------------------- 9. check-in list
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b1","role":"authenticated"}', true);
do $$
declare names text; leaked int;
begin
  select string_agg(name || ':' || coalesce(check_in_method::text, '-'), ', ' order by name) into names
  from public.get_event_check_in_list(pg_temp.ev('in'));
  perform pg_temp.ok('66 list: manager sees the event''s registrants by name with state',
    names = 'Student A:scan, Student D:scan', names);

  select count(*) into leaked
  from public.get_event_check_in_list(pg_temp.ev('in')) l, t_ctx c
  where c.k like 'tok_%' and row_to_json(l)::text like '%' || c.v || '%';
  perform pg_temp.ok('67 list: no token value appears in its output', leaked = 0, leaked || ' rows leaking');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b2","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.get_event_check_in_list(pg_temp.ev('in'));
  perform pg_temp.ok('68 list: manager of another club gets nothing', n = 0, n || ' rows');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000a1","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.get_event_check_in_list(pg_temp.ev('in'));
  perform pg_temp.ok('69 list: a registered student gets nothing', n = 0, n || ' rows');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-00dc-0000000000b4","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.get_event_check_in_list(pg_temp.ev('in'));
  perform pg_temp.ok('70 list: super_admin sees it', n = 2, n || ' rows');
end $$;
reset role;

-- ---------------------------------------------------------------- report
select n, case when pass then 'PASS' else 'FAIL' end as result, name, detail
from t_results order by n;

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed
from t_results;

rollback;
