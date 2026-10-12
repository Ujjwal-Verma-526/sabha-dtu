-- Role tests for 20260903000001_club_creator_delete.sql.
-- Runs entirely inside one transaction and ends in ROLLBACK: nothing persists.
-- LOCAL STACK ONLY. Never run against the live project.
--
--   npx supabase start
--   docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/club_creator_delete_roles.sql
--
-- Every row of the final report should say PASS.
--
-- The rules: deleting a user clears clubs.created_by (and events.created_by)
-- without error, whoever runs the delete. Writing created_by through the API
-- is still refused for everyone but a super_admin, whether the new value is
-- null or another user, and slug and verified stay protected.
--
-- Actors: A = admin (creator) of club C, B = creator of club D, M = a second
-- admin of club C (not its creator), X = student, Z = creator of club E and
-- of one event, S = super_admin.
-- A user is simulated with SET LOCAL ROLE authenticated + a request.jwt.claims
-- `sub`, which is what auth.uid() reads: the path a PATCH to /rest/v1/clubs
-- takes through PostgREST. A user delete is simulated as the owner, the way
-- the auth admin API / SQL editor does it.

\set ON_ERROR_STOP on
begin;

create temp table t_results (n serial, name text, pass boolean, detail text);
grant all on t_results to public;
grant usage on sequence t_results_n_seq to public;

create function pg_temp.ok(name text, pass boolean, detail text default '')
returns void language sql as $$
  insert into t_results (name, pass, detail) values ($1, coalesce($2, false), $3);
$$;

create function pg_temp.uid(who text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-00cd-0000000000' || case $1
    when 'A' then 'a1' when 'B' then 'b1' when 'M' then 'c1'
    when 'X' then 'd1' when 'Z' then 'e1' when 'S' then 'f1' end)::uuid;
$$;

create function pg_temp.club(which text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-00cd-00000000c' || case $1
    when 'C' then '001' when 'D' then '002' when 'E' then '003' end)::uuid;
$$;

create function pg_temp.as_user(who text) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when who is null then json_build_object('role', 'anon')::text
         else json_build_object('sub', pg_temp.uid(who), 'role', 'authenticated')::text end,
    true);
$$;

-- Runs `sql` as `who` under the current role and returns 'ok', '0 rows' or
-- the error text. The change is always undone (a private SQLSTATE rolls back
-- just this block).
create function pg_temp.try_sql(who text, sql text)
returns text language plpgsql as $$
declare
  n integer;
begin
  perform pg_temp.as_user(who);
  execute sql;
  get diagnostics n = row_count;
  raise exception using errcode = 'SB001', message = n::text;
exception
  when sqlstate 'SB001' then
    return case when sqlerrm = '0' then '0 rows' else 'ok' end;
  when others then
    return sqlerrm;
end $$;

create function pg_temp.created_by(club text) returns uuid language sql stable as $$
  select created_by from public.clubs where id = pg_temp.club($1);
$$;

-- ---------------------------------------------------------------- setup (owner)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-00cd-0000000000a1', 'cd-a@test.local', '{"name":"Admin A"}'),
  ('00000000-0000-0000-00cd-0000000000b1', 'cd-b@test.local', '{"name":"Admin B"}'),
  ('00000000-0000-0000-00cd-0000000000c1', 'cd-m@test.local', '{"name":"Admin M"}'),
  ('00000000-0000-0000-00cd-0000000000d1', 'cd-x@test.local', '{"name":"Student X"}'),
  ('00000000-0000-0000-00cd-0000000000e1', 'cd-z@test.local', '{"name":"Creator Z"}'),
  ('00000000-0000-0000-00cd-0000000000f1', 'cd-s@test.local', '{"name":"Super S"}');

set local session_replication_role = replica;
update public.users set role = 'super_admin' where id = pg_temp.uid('S');
set local session_replication_role = origin;

insert into public.clubs (id, name, slug, verified, created_by) values
  (pg_temp.club('C'), 'CD Club C', 'cd-club-c', false, pg_temp.uid('A')),
  (pg_temp.club('D'), 'CD Club D', 'cd-club-d', false, pg_temp.uid('B')),
  (pg_temp.club('E'), 'CD Club E', 'cd-club-e', false, pg_temp.uid('Z'));

-- M is a second approved admin of C (added by A, an existing admin).
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('A'))::text, true);
insert into public.club_members (club_id, user_id, role, status)
values (pg_temp.club('C'), pg_temp.uid('M'), 'admin', 'approved');
select set_config('request.jwt.claims', null, true);

insert into public.events (id, club_id, title, slug, venue, start_at, end_at, status, created_by) values
  ('00000000-0000-0000-00cd-0000000000e9', pg_temp.club('E'), 'CD Event', 'cd-event', 'Hall',
   now() + interval '3 days', now() + interval '3 days 2 hours', 'published', pg_temp.uid('Z'));

-- ---------------------------------------------------------------- API writes
set local role authenticated;

do $$
declare r text;
begin
  r := pg_temp.try_sql('A', format('update public.clubs set created_by = null where id = %L', pg_temp.club('C')));
  perform pg_temp.ok('01 creator admin: setting created_by to null is refused',
    r like '%only a super_admin can change club ownership%', r);

  r := pg_temp.try_sql('A', format('update public.clubs set created_by = %L where id = %L', pg_temp.uid('X'), pg_temp.club('C')));
  perform pg_temp.ok('02 creator admin: handing created_by to someone else is refused',
    r like '%only a super_admin can change club ownership%', r);

  r := pg_temp.try_sql('M', format('update public.clubs set created_by = null where id = %L', pg_temp.club('C')));
  perform pg_temp.ok('03 other admin: clearing created_by is refused (the creator still exists)',
    r like '%only a super_admin can change club ownership%', r);

  r := pg_temp.try_sql('M', format('update public.clubs set created_by = %L where id = %L', pg_temp.uid('M'), pg_temp.club('C')));
  perform pg_temp.ok('04 other admin: taking over created_by is refused',
    r like '%only a super_admin can change club ownership%', r);

  r := pg_temp.try_sql('M', format('update public.clubs set created_by = null where id = %L', pg_temp.club('E')));
  perform pg_temp.ok('05 admin of another club: cannot reach this club at all',
    r = '0 rows', r);

  r := pg_temp.try_sql('A', format('update public.clubs set slug = %L where id = %L', 'cd-new-slug', pg_temp.club('C')));
  perform pg_temp.ok('06 slug stays protected', r like '%only a super_admin can change a club slug%', r);

  r := pg_temp.try_sql('A', format('update public.clubs set verified = true where id = %L', pg_temp.club('C')));
  perform pg_temp.ok('07 verified stays protected', r like '%only a super_admin can change verified status%', r);

  r := pg_temp.try_sql('A', format('update public.clubs set description = %L where id = %L', 'still editable', pg_temp.club('C')));
  perform pg_temp.ok('08 ordinary club details can still be edited', r = 'ok', r);

  r := pg_temp.try_sql('A', format('update public.clubs set created_by = %L where id = %L', pg_temp.uid('A'), pg_temp.club('C')));
  perform pg_temp.ok('09 writing the unchanged created_by is fine', r = 'ok', r);

  r := pg_temp.try_sql('S', format('update public.clubs set created_by = %L where id = %L', pg_temp.uid('X'), pg_temp.club('C')));
  perform pg_temp.ok('10 super admin: may still reassign created_by', r = 'ok', r);

  r := pg_temp.try_sql('S', format('update public.clubs set created_by = null where id = %L', pg_temp.club('C')));
  perform pg_temp.ok('11 super admin: may still clear created_by', r = 'ok', r);
end $$;

reset role;

-- ---------------------------------------------------------------- user deletes
-- Nothing above kept a change, so C is still created by A.
do $$
begin
  perform pg_temp.ok('12 setup intact: club C still created by A, E by Z',
    pg_temp.created_by('C') = pg_temp.uid('A') and pg_temp.created_by('E') = pg_temp.uid('Z'));
end $$;

-- Deleting Z (creator of club E, who also created event cd-event) as the
-- owner with no auth.uid(), like the SQL editor or the auth admin API.
select set_config('request.jwt.claims', null, true);
delete from auth.users where id = pg_temp.uid('Z');

do $$
begin
  perform pg_temp.ok('13 delete creator (no auth.uid): the delete succeeds',
    not exists (select 1 from auth.users where id = pg_temp.uid('Z')));
  perform pg_temp.ok('14 delete creator: the club survives with created_by null',
    exists (select 1 from public.clubs where id = pg_temp.club('E')) and pg_temp.created_by('E') is null);
  perform pg_temp.ok('15 delete creator: their event survives with created_by null',
    exists (select 1 from public.events where id = '00000000-0000-0000-00cd-0000000000e9'
            and created_by is null));
  perform pg_temp.ok('16 delete creator: other clubs are untouched',
    pg_temp.created_by('C') = pg_temp.uid('A') and pg_temp.created_by('D') = pg_temp.uid('B'));
end $$;

-- Deleting B while a plain student's session is the current auth.uid(): the
-- clearing must not depend on who runs the delete.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('X'))::text, true);
delete from auth.users where id = pg_temp.uid('B');

do $$
begin
  perform pg_temp.ok('17 delete creator while a non-super-admin is the session user: succeeds',
    not exists (select 1 from auth.users where id = pg_temp.uid('B'))
    and exists (select 1 from public.clubs where id = pg_temp.club('D'))
    and pg_temp.created_by('D') is null);
end $$;

-- Deleting the profile row directly (public.users) clears it the same way.
select set_config('request.jwt.claims', null, true);
delete from public.users where id = pg_temp.uid('A');

do $$
begin
  perform pg_temp.ok('18 delete a profile row directly: created_by cleared too',
    pg_temp.created_by('C') is null);
  perform pg_temp.ok('19 delete creator: the other admin M of club C keeps the club',
    exists (select 1 from public.club_members
            where club_id = pg_temp.club('C') and user_id = pg_temp.uid('M')
              and role = 'admin' and status = 'approved'));
end $$;

-- ---------------------------------------------------------------- after
-- With no creator left, an admin still can't set one.
set local role authenticated;

do $$
declare r text;
begin
  r := pg_temp.try_sql('M', format('update public.clubs set created_by = %L where id = %L', pg_temp.uid('M'), pg_temp.club('C')));
  perform pg_temp.ok('20 after the creator is gone: an admin still cannot set created_by',
    r like '%only a super_admin can change club ownership%', r);

  r := pg_temp.try_sql('M', format('update public.clubs set description = %L where id = %L', 'edited', pg_temp.club('C')));
  perform pg_temp.ok('21 after the creator is gone: the club can still be edited', r = 'ok', r);
end $$;

reset role;

-- Installed definition.
do $$
begin
  perform pg_temp.ok('22 install: guard function is security definer with a search_path',
    (select prosecdef and proconfig is not null from pg_proc
     where oid = 'public.prevent_club_protected_field_changes()'::regprocedure));
  perform pg_temp.ok('23 install: trigger still fires before update on clubs',
    exists (select 1 from pg_trigger
            where tgrelid = 'public.clubs'::regclass
              and tgname = 'clubs_prevent_protected_field_changes' and tgenabled = 'O'));
end $$;

-- ---------------------------------------------------------------- report
select n, case when pass then 'PASS' else 'FAIL' end as result, name, detail
from t_results order by n;

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed
from t_results;

rollback;
