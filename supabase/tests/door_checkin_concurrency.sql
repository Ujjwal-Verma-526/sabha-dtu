-- Concurrency test for 20260830000001_door_checkin.sql: two doors check in
-- the same registration at the same moment.
-- LOCAL STACK ONLY. Never run against the live project.
--
--   docker exec -i supabase_db_sabha psql -U supabase_admin -d postgres < supabase/tests/door_checkin_concurrency.sql
--
-- Runs as supabase_admin because dblink needs a superuser to open sessions
-- without a password. It COMMITS its own fixtures (a second session can't
-- see another transaction's uncommitted rows), so it deletes them at the
-- start and at the end. It installs dblink into `extensions` if missing and
-- drops it again afterwards.
--
-- Each round: session 1 checks the registration in and keeps its transaction
-- open, so it holds the row lock. Session 2 sends the same check-in and is
-- confirmed to be waiting on that lock (pg_stat_activity). Session 1 commits.
-- Expected: session 1 gets checked_in, session 2 gets already_checked_in
-- with session 1's time. Rounds: scan + scan, then scan + manual.

\set ON_ERROR_STOP on

do $$
begin
  if not (select rolsuper from pg_roles where rolname = current_user) then
    raise exception 'run this as supabase_admin (dblink needs a superuser)';
  end if;
  if to_regprocedure('public.check_in_by_token(uuid,text)') is null then
    raise exception 'apply 20260830000001_door_checkin first';
  end if;
end $$;

create temp table t_results (n serial, name text, pass boolean, detail text);
create temp table t_ctx (k text primary key, v text);

create function pg_temp.ok(name text, pass boolean, detail text default '')
returns void language sql as $$
  insert into t_results (name, pass, detail) values ($1, coalesce($2, false), $3);
$$;

insert into t_ctx values
  ('installed_dblink', (not exists (select 1 from pg_extension where extname = 'dblink'))::text);
create extension if not exists dblink schema extensions;

create function pg_temp.cleanup() returns void language sql as $$
  delete from public.clubs where id = '00000000-0000-0000-00cc-0000000000c1';
  delete from auth.users where id in (
    '00000000-0000-0000-00cc-0000000000a1',
    '00000000-0000-0000-00cc-0000000000a2',
    '00000000-0000-0000-00cc-0000000000b1');
$$;

-- ---------------------------------------------------------------- fixtures (committed)
select pg_temp.cleanup();

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-00cc-0000000000a1', 'cc-a@test.local', '{"name":"Concurrent A"}'),
  ('00000000-0000-0000-00cc-0000000000a2', 'cc-b@test.local', '{"name":"Concurrent B"}'),
  ('00000000-0000-0000-00cc-0000000000b1', 'cc-m@test.local', '{"name":"Concurrent Manager"}');

insert into public.clubs (id, name, slug, verified, created_by) values
  ('00000000-0000-0000-00cc-0000000000c1', 'CC Club', 'cc-club', true,
   '00000000-0000-0000-00cc-0000000000b1');

insert into public.events (id, club_id, title, slug, venue, start_at, end_at, status, created_by) values
  ('00000000-0000-0000-00cc-0000000000e1', '00000000-0000-0000-00cc-0000000000c1',
   'CC Event', 'cc-event', 'Hall', now() + interval '1 hour', now() + interval '3 hours',
   'published', '00000000-0000-0000-00cc-0000000000b1');

insert into public.event_registrations (event_id, user_id) values
  ('00000000-0000-0000-00cc-0000000000e1', '00000000-0000-0000-00cc-0000000000a1'),
  ('00000000-0000-0000-00cc-0000000000e1', '00000000-0000-0000-00cc-0000000000a2');

insert into t_ctx
select 'reg_' || r.user_id, r.id::text from public.event_registrations r
where r.event_id = '00000000-0000-0000-00cc-0000000000e1';
insert into t_ctx
select 'tok_' || r.user_id, t.token
from public.event_registrations r join public.registration_tickets t on t.registration_id = r.id
where r.event_id = '00000000-0000-0000-00cc-0000000000e1';

-- ---------------------------------------------------------------- sessions
do $$
declare cs text := format('dbname=%s user=postgres', current_database());
begin
  perform extensions.dblink_connect('door1', cs);
  perform extensions.dblink_connect('door2', cs);
end $$;

-- Opens a transaction on a door session acting as the manager.
create function pg_temp.start_as_manager(conn text) returns void language plpgsql as $$
begin
  perform extensions.dblink_exec(conn, 'begin');
  perform extensions.dblink_exec(conn, 'set local role authenticated');
  -- set_config returns a row, which dblink_exec refuses; use dblink().
  perform * from extensions.dblink(conn, $q$select set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-00cc-0000000000b1","role":"authenticated"}', true)$q$) as t(v text);
end $$;

-- One round: door1 runs sql1 and holds its lock; door2 sends sql2 and must
-- block on it; door1 commits; door2's result is read.
create function pg_temp.race(label text, sql1 text, sql2 text, rid uuid) returns void
language plpgsql as $$
declare
  r1 record;
  r2 record;
  pid2 int;
  waited text;
  final record;
begin
  perform pg_temp.start_as_manager('door1');
  perform pg_temp.start_as_manager('door2');
  select pid into pid2 from extensions.dblink('door2', 'select pg_backend_pid()') as t(pid int);

  select * into r1 from extensions.dblink('door1', sql1) as t(outcome text, at timestamptz);

  perform extensions.dblink_send_query('door2', sql2);
  for i in 1..1000 loop
    perform pg_stat_clear_snapshot();
    select wait_event_type into waited from pg_stat_activity where pid = pid2;
    exit when waited = 'Lock';
    perform pg_sleep(0.01);
  end loop;

  perform extensions.dblink_exec('door1', 'commit');
  select * into r2 from extensions.dblink_get_result('door2') as t(outcome text, at timestamptz);
  perform * from extensions.dblink_get_result('door2') as t(outcome text, at timestamptz);
  perform extensions.dblink_exec('door2', 'commit');

  select checked_in_at, check_in_method::text as method into final
  from public.event_registrations where id = rid;

  perform pg_temp.ok(label || ': door 1 checks in', r1.outcome = 'checked_in', r1.outcome);
  perform pg_temp.ok(label || ': door 2 was blocked on the row lock', waited = 'Lock', coalesce(waited, 'not waiting'));
  perform pg_temp.ok(label || ': door 2 gets already_checked_in with door 1''s time',
    r2.outcome = 'already_checked_in' and r2.at = r1.at,
    format('%s, %s vs %s', r2.outcome, r2.at, r1.at));
  perform pg_temp.ok(label || ': one check-in stored, by scan, at door 1''s time',
    final.checked_in_at = r1.at and final.method = 'scan',
    format('%s, %s', final.checked_in_at, final.method));
end $$;

select pg_temp.race(
  '01 scan + scan',
  format('select outcome, checked_in_at from public.check_in_by_token(%L, %L)',
         '00000000-0000-0000-00cc-0000000000e1', (select v from t_ctx where k = 'tok_00000000-0000-0000-00cc-0000000000a1')),
  format('select outcome, checked_in_at from public.check_in_by_token(%L, %L)',
         '00000000-0000-0000-00cc-0000000000e1', (select v from t_ctx where k = 'tok_00000000-0000-0000-00cc-0000000000a1')),
  (select v::uuid from t_ctx where k = 'reg_00000000-0000-0000-00cc-0000000000a1'));

select pg_temp.race(
  '02 scan + manual',
  format('select outcome, checked_in_at from public.check_in_by_token(%L, %L)',
         '00000000-0000-0000-00cc-0000000000e1', (select v from t_ctx where k = 'tok_00000000-0000-0000-00cc-0000000000a2')),
  format('select outcome, checked_in_at from public.manual_check_in(%L)',
         (select v from t_ctx where k = 'reg_00000000-0000-0000-00cc-0000000000a2')),
  (select v::uuid from t_ctx where k = 'reg_00000000-0000-0000-00cc-0000000000a2'));

-- ---------------------------------------------------------------- cleanup
do $$
begin
  perform extensions.dblink_disconnect('door1');
  perform extensions.dblink_disconnect('door2');
end $$;

select pg_temp.cleanup();

do $$
begin
  perform pg_temp.ok('03 fixtures removed',
    not exists (select 1 from public.clubs where id = '00000000-0000-0000-00cc-0000000000c1')
    and not exists (select 1 from auth.users where email like 'cc-%@test.local'), '');
  if (select v from t_ctx where k = 'installed_dblink') = 'true' then
    drop extension dblink;
  end if;
  perform pg_temp.ok('04 dblink left as it was',
    exists (select 1 from pg_extension where extname = 'dblink')
      = ((select v from t_ctx where k = 'installed_dblink') = 'false'), '');
end $$;

-- ---------------------------------------------------------------- report
select n, case when pass then 'PASS' else 'FAIL' end as result, name, detail
from t_results order by n;

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed
from t_results;
