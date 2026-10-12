-- Role tests for 20260902000001_security_hardening.sql.
-- Runs entirely inside one transaction and ends in ROLLBACK: nothing persists.
-- LOCAL STACK ONLY. Never run against the live project.
--
--   npx supabase start
--   docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/security_hardening_roles.sql
--
-- Every row of the final report should say PASS.
--
-- What it proves:
--   1. is_super_admin / is_club_manager answer only for the caller: anon and
--      other users can't probe, while the public read policies still work.
--   2. club_members: a coordinator can't add, change or remove an admin row,
--      but keeps everything else; user_id and club_id never change; a club
--      never loses its last approved admin; club creation (by a super admin
--      or the owner) still makes the creator an admin; cascades still pass.
--   3. instagram_handle, logo_url and banner_url CHECKs.
--   4. event-banners: no anonymous listing, managers still list their folder.
--   5. TRUNCATE is gone for anon and authenticated, now and for new tables.
--
-- Actors: A = admin of club C (its creator), K = coordinator of C,
-- M = approved member of C, P = pending applicant to C, X = student with no
-- membership, O = admin of club D, S = super_admin.
-- A user is simulated with SET LOCAL ROLE authenticated (or anon) plus a
-- request.jwt.claims `sub`, which is what auth.uid() reads: the same path a
-- request to /rest/v1 takes through PostgREST, skipping the app.

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
  select ('00000000-0000-0000-005e-0000000000' || case $1
    when 'A' then 'a1' when 'K' then 'b1' when 'M' then 'c1' when 'P' then 'c2'
    when 'X' then 'd1' when 'O' then 'e1' when 'S' then 'f1' end)::uuid;
$$;

create function pg_temp.club(which text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-005e-00000000c' || case $1
    when 'C' then '001' when 'D' then '002' when 'U' then '003' end)::uuid;
$$;

-- Sets auth.uid() to `who` (no sub at all when who is null).
create function pg_temp.as_user(who text) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when who is null then json_build_object('role', 'anon')::text
         else json_build_object('sub', pg_temp.uid(who), 'role', 'authenticated')::text end,
    true);
$$;

-- Runs `sql` as `who` under the current role and returns 'ok', '0 rows'
-- (RLS matched nothing) or the error text. Nothing is kept unless `keep`:
-- a successful statement is undone by raising a private SQLSTATE, which
-- rolls back just this block.
create function pg_temp.try_sql(who text, sql text, keep boolean default false)
returns text language plpgsql as $$
declare
  n integer;
begin
  perform pg_temp.as_user(who);
  execute sql;
  get diagnostics n = row_count;
  if not keep then
    raise exception using errcode = 'SB001', message = n::text;
  end if;
  return case when n = 0 then '0 rows' else 'ok' end;
exception
  when sqlstate 'SB001' then
    return case when sqlerrm = '0' then '0 rows' else 'ok' end;
  when others then
    return sqlerrm;
end $$;

create function pg_temp.member(who text, club text) returns public.club_members
language sql stable as $$
  select * from public.club_members
  where user_id = pg_temp.uid(who) and club_id = pg_temp.club(club);
$$;

create function pg_temp.approved_admins(club text) returns bigint
language sql stable as $$
  select count(*) from public.club_members
  where club_id = pg_temp.club(club) and role = 'admin' and status = 'approved';
$$;

-- ---------------------------------------------------------------- setup (owner)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-005e-0000000000a1', 'sh-a@test.local', '{"name":"Admin A"}'),
  ('00000000-0000-0000-005e-0000000000b1', 'sh-k@test.local', '{"name":"Coordinator K"}'),
  ('00000000-0000-0000-005e-0000000000c1', 'sh-m@test.local', '{"name":"Member M"}'),
  ('00000000-0000-0000-005e-0000000000c2', 'sh-p@test.local', '{"name":"Pending P"}'),
  ('00000000-0000-0000-005e-0000000000d1', 'sh-x@test.local', '{"name":"Student X"}'),
  ('00000000-0000-0000-005e-0000000000e1', 'sh-o@test.local', '{"name":"Admin O"}'),
  ('00000000-0000-0000-005e-0000000000f1', 'sh-s@test.local', '{"name":"Super S"}');

-- Same bootstrap as README: the escalation trigger blocks role changes unless
-- the caller is already a super_admin, so promote with triggers bypassed.
set local session_replication_role = replica;
update public.users set role = 'super_admin' where id = pg_temp.uid('S');
set local session_replication_role = origin;

-- Created by the owner with no auth.uid(): handle_new_club's first admin row
-- must still go in (the trigger's new-club exception).
insert into public.clubs (id, name, slug, verified, created_by) values
  (pg_temp.club('C'), 'SH Club C', 'sh-club-c', true,  pg_temp.uid('A')),
  (pg_temp.club('D'), 'SH Club D', 'sh-club-d', true,  pg_temp.uid('O')),
  (pg_temp.club('U'), 'SH Club U', 'sh-club-u', false, null);

-- Non-admin rows, so the owner can insert them without acting as anyone.
insert into public.club_members (club_id, user_id, role, status) values
  (pg_temp.club('C'), pg_temp.uid('K'), 'coordinator', 'approved'),
  (pg_temp.club('C'), pg_temp.uid('M'), 'member', 'approved'),
  (pg_temp.club('C'), pg_temp.uid('P'), 'member', 'pending');

insert into public.events (id, club_id, title, slug, venue, start_at, end_at, status, created_by) values
  ('00000000-0000-0000-005e-0000000000e9', pg_temp.club('C'), 'SH Event', 'sh-event', 'Hall',
   now() + interval '3 days', now() + interval '3 days 2 hours', 'published', pg_temp.uid('A')),
  ('00000000-0000-0000-005e-0000000000ea', pg_temp.club('C'), 'SH Draft', 'sh-draft', 'Hall',
   now() + interval '4 days', now() + interval '4 days 2 hours', 'draft', pg_temp.uid('A'));

-- One banner in club C's folder, as an upload would leave it.
insert into storage.objects (bucket_id, name, owner) values
  ('event-banners', pg_temp.club('C') || '/sh-banner.jpg', pg_temp.uid('A'));

do $$
begin
  perform pg_temp.ok('00 setup: owner-created clubs made their creators approved admins (new-club exception)',
    (pg_temp.member('A', 'C')).role = 'admin' and (pg_temp.member('A', 'C')).status = 'approved'
    and (pg_temp.member('O', 'D')).role = 'admin'
    and pg_temp.approved_admins('C') = 1 and pg_temp.approved_admins('D') = 1,
    pg_temp.approved_admins('C') || ' / ' || pg_temp.approved_admins('D'));
end $$;

-- ------------------------------------------------ 1. no probing (L5)
set local role anon;
select pg_temp.as_user(null);
do $$
begin
  perform pg_temp.ok('10 anon: is_super_admin(super admin) is false',
    public.is_super_admin(pg_temp.uid('S')) is false);
  perform pg_temp.ok('11 anon: is_club_manager(admin, their club) is false',
    public.is_club_manager(pg_temp.uid('A'), pg_temp.club('C')) is false);
  perform pg_temp.ok('12 anon: is_club_manager(coordinator, their club) is false',
    public.is_club_manager(pg_temp.uid('K'), pg_temp.club('C')) is false);
  perform pg_temp.ok('13 anon: still reads verified clubs, not the unverified one',
    (select count(*) from public.clubs where id in (pg_temp.club('C'), pg_temp.club('D'))) = 2
    and not exists (select 1 from public.clubs where id = pg_temp.club('U')));
  perform pg_temp.ok('14 anon: still reads the published event, not the draft',
    exists (select 1 from public.events where slug = 'sh-event')
    and not exists (select 1 from public.events where slug = 'sh-draft'));
end $$;
reset role;

set local role authenticated;
do $$
begin
  perform pg_temp.as_user('X');
  perform pg_temp.ok('15 student: is_super_admin(super admin) is false',
    public.is_super_admin(pg_temp.uid('S')) is false);
  perform pg_temp.ok('16 student: is_club_manager(admin, their club) is false',
    public.is_club_manager(pg_temp.uid('A'), pg_temp.club('C')) is false);
  perform pg_temp.ok('17 student: is_super_admin(null) is false, not null',
    public.is_super_admin(null) is false);

  perform pg_temp.as_user('S');
  perform pg_temp.ok('18 super admin: is_super_admin(self) is true',
    public.is_super_admin(pg_temp.uid('S')) is true);
  perform pg_temp.ok('19 super admin: is_club_manager(someone else) is false',
    public.is_club_manager(pg_temp.uid('A'), pg_temp.club('C')) is false);

  perform pg_temp.as_user('A');
  perform pg_temp.ok('20 admin: is_club_manager(self, own club) is true',
    public.is_club_manager(pg_temp.uid('A'), pg_temp.club('C')) is true);
  perform pg_temp.as_user('K');
  perform pg_temp.ok('21 coordinator: is_club_manager(self, own club) is true',
    public.is_club_manager(pg_temp.uid('K'), pg_temp.club('C')) is true);

  perform pg_temp.as_user('X');
  perform pg_temp.ok('22 student: unverified club still hidden',
    not exists (select 1 from public.clubs where id = pg_temp.club('U')));
  perform pg_temp.as_user('A');
  perform pg_temp.ok('23 admin: still sees their club''s draft event',
    exists (select 1 from public.events where slug = 'sh-draft'));
  perform pg_temp.as_user('S');
  perform pg_temp.ok('24 super admin: still sees the unverified club and draft event',
    exists (select 1 from public.clubs where id = pg_temp.club('U'))
    and exists (select 1 from public.events where slug = 'sh-draft'));
end $$;

do $$
declare r text;
begin
  r := pg_temp.try_sql('A', format('update public.clubs set description = %L where id = %L',
    'edited', pg_temp.club('C')));
  perform pg_temp.ok('25 admin: still updates their club', r = 'ok', r);

  r := pg_temp.try_sql('K', format('update public.events set venue = %L where slug = %L', 'OAT', 'sh-event'));
  perform pg_temp.ok('26 coordinator: still updates their club''s event', r = 'ok', r);

  r := pg_temp.try_sql('X', format('update public.users set role = %L where id = %L',
    'super_admin', pg_temp.uid('X')));
  perform pg_temp.ok('27 student: self-promotion to super_admin is still refused',
    r like '%not permitted to change role%', r);

  r := pg_temp.try_sql('S', format('update public.users set role = %L where id = %L',
    'club_admin', pg_temp.uid('X')));
  perform pg_temp.ok('28 super admin: can still change someone''s role', r = 'ok', r);
end $$;
reset role;

do $$
declare r text;
begin
  perform set_config('request.jwt.claims', '', true);
  r := pg_temp.try_sql(null, format('update public.users set role = %L where id = %L',
    'super_admin', pg_temp.uid('X')));
  perform pg_temp.ok('29 owner with no auth.uid(): role change still refused (helpers never return null)',
    r like '%not permitted to change role%', r);
end $$;

-- ------------------------------------------------ 2. admin rows (L3)
set local role authenticated;
do $$
declare r text;
begin
  -- the coordinator against the admin
  r := pg_temp.try_sql('K', format('delete from public.club_members where club_id = %L and user_id = %L',
    pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('30 coordinator: can''t remove the admin',
    r like '%only a club admin or a super admin%', r);

  r := pg_temp.try_sql('K', format('update public.club_members set role = %L where club_id = %L and user_id = %L',
    'member', pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('31 coordinator: can''t demote the admin to member',
    r like '%only a club admin or a super admin%', r);

  r := pg_temp.try_sql('K', format('update public.club_members set role = %L where club_id = %L and user_id = %L',
    'coordinator', pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('32 coordinator: can''t demote the admin to coordinator',
    r like '%only a club admin or a super admin%', r);

  r := pg_temp.try_sql('K', format('update public.club_members set status = %L where club_id = %L and user_id = %L',
    'rejected', pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('33 coordinator: can''t reject the admin',
    r like '%only a club admin or a super admin%', r);

  r := pg_temp.try_sql('K', format('update public.club_members set joined_at = now() where club_id = %L and user_id = %L',
    pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('34 coordinator: can''t touch the admin row at all',
    r like '%only a club admin or a super admin%', r);

  r := pg_temp.try_sql('K', format('update public.club_members set role = %L where club_id = %L and user_id = %L',
    'admin', pg_temp.club('C'), pg_temp.uid('M')));
  perform pg_temp.ok('35 coordinator: can''t promote a member to admin',
    r like '%only a club admin or a super admin%', r);

  r := pg_temp.try_sql('K', format('insert into public.club_members (club_id, user_id, role, status) values (%L, %L, %L, %L)',
    pg_temp.club('C'), pg_temp.uid('X'), 'admin', 'approved'));
  perform pg_temp.ok('36 coordinator: can''t add an approved admin',
    r like '%only a club admin or a super admin%', r);

  r := pg_temp.try_sql('K', format('insert into public.club_members (club_id, user_id, role, status) values (%L, %L, %L, %L)',
    pg_temp.club('C'), pg_temp.uid('X'), 'admin', 'pending'));
  perform pg_temp.ok('37 coordinator: can''t add a pending admin either',
    r like '%only a club admin or a super admin%', r);

  r := pg_temp.try_sql('K', format('update public.club_members set role = %L where club_id = %L and user_id = %L',
    'admin', pg_temp.club('C'), pg_temp.uid('K')));
  perform pg_temp.ok('38 coordinator: can''t promote themselves to admin',
    r like '%only a club admin or a super admin%' or r like '%cannot change your own membership%', r);

  -- everything else a coordinator could do before
  r := pg_temp.try_sql('K', format('update public.club_members set status = %L where club_id = %L and user_id = %L',
    'approved', pg_temp.club('C'), pg_temp.uid('P')));
  perform pg_temp.ok('39 coordinator: still approves a pending request', r = 'ok', r);

  r := pg_temp.try_sql('K', format('update public.club_members set status = %L where club_id = %L and user_id = %L',
    'rejected', pg_temp.club('C'), pg_temp.uid('P')));
  perform pg_temp.ok('40 coordinator: still rejects a pending request', r = 'ok', r);

  r := pg_temp.try_sql('K', format('update public.club_members set role = %L where club_id = %L and user_id = %L',
    'coordinator', pg_temp.club('C'), pg_temp.uid('M')));
  perform pg_temp.ok('41 coordinator: still promotes a member to coordinator', r = 'ok', r);

  r := pg_temp.try_sql('K', format('insert into public.club_members (club_id, user_id, role, status) values (%L, %L, %L, %L)',
    pg_temp.club('C'), pg_temp.uid('X'), 'member', 'approved'));
  perform pg_temp.ok('42 coordinator: still adds a member directly', r = 'ok', r);

  r := pg_temp.try_sql('K', format('delete from public.club_members where club_id = %L and user_id = %L',
    pg_temp.club('C'), pg_temp.uid('M')));
  perform pg_temp.ok('43 coordinator: still removes a member', r = 'ok', r);

  r := pg_temp.try_sql('K', format('delete from public.club_members where club_id = %L and user_id = %L',
    pg_temp.club('C'), pg_temp.uid('K')));
  perform pg_temp.ok('44 coordinator: can still leave', r = 'ok', r);

  -- other clubs' people get nothing (RLS, unchanged)
  r := pg_temp.try_sql('O', format('delete from public.club_members where club_id = %L and user_id = %L',
    pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('45 another club''s admin: can''t remove this club''s admin (RLS: 0 rows)', r = '0 rows', r);

  r := pg_temp.try_sql('X', format('insert into public.club_members (club_id, user_id, role, status) values (%L, %L, %L, %L)',
    pg_temp.club('C'), pg_temp.uid('X'), 'admin', 'approved'));
  -- BEFORE triggers run ahead of the policy's WITH CHECK, so the trigger
  -- usually answers first; either refusal is fine.
  perform pg_temp.ok('46 student: can''t make themselves admin',
    r like '%only a club admin or a super admin%' or r like '%row-level security%', r);
end $$;

-- last admin: nobody removes, demotes or un-approves the only one
do $$
declare r text;
begin
  r := pg_temp.try_sql('A', format('delete from public.club_members where club_id = %L and user_id = %L',
    pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('50 last admin: can''t leave', r like '%must keep at least one approved admin%', r);

  r := pg_temp.try_sql('S', format('delete from public.club_members where club_id = %L and user_id = %L',
    pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('51 last admin: super admin can''t remove them', r like '%must keep at least one approved admin%', r);

  r := pg_temp.try_sql('S', format('update public.club_members set role = %L where club_id = %L and user_id = %L',
    'coordinator', pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('52 last admin: super admin can''t demote them', r like '%must keep at least one approved admin%', r);

  r := pg_temp.try_sql('S', format('update public.club_members set status = %L where club_id = %L and user_id = %L',
    'rejected', pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('53 last admin: super admin can''t reject them', r like '%must keep at least one approved admin%', r);

  r := pg_temp.try_sql('S', format('update public.club_members set status = %L where club_id = %L and user_id = %L',
    'pending', pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('54 last admin: super admin can''t move them back to pending', r like '%must keep at least one approved admin%', r);

  -- try_sql's settings roll back with it, so act as S again to look.
  perform pg_temp.as_user('S');
  perform pg_temp.ok('55 last admin: still there after all that',
    pg_temp.approved_admins('C') = 1 and (pg_temp.member('A', 'C')).role = 'admin');
end $$;

-- with a second admin: admins manage admins, and the last one still stays
do $$
declare r text;
begin
  r := pg_temp.try_sql('A', format('update public.club_members set role = %L where club_id = %L and user_id = %L',
    'admin', pg_temp.club('C'), pg_temp.uid('M')), true);
  perform pg_temp.ok('60 admin: promotes a member to admin', r = 'ok' and pg_temp.approved_admins('C') = 2, r);

  r := pg_temp.try_sql('S', format('delete from public.club_members where club_id = %L and role = %L',
    pg_temp.club('C'), 'admin'));
  perform pg_temp.ok('61 two admins deleted in one statement: refused (the second would be the last)',
    r like '%must keep at least one approved admin%' and pg_temp.approved_admins('C') = 2, r);

  r := pg_temp.try_sql('S', format('update public.club_members set role = %L where club_id = %L and role = %L',
    'member', pg_temp.club('C'), 'admin'));
  perform pg_temp.ok('62 two admins demoted in one statement: refused',
    r like '%must keep at least one approved admin%' and pg_temp.approved_admins('C') = 2, r);

  r := pg_temp.try_sql('A', format('update public.club_members set role = %L where club_id = %L and user_id = %L',
    'coordinator', pg_temp.club('C'), pg_temp.uid('M')));
  perform pg_temp.ok('63 admin: demotes the other admin', r = 'ok', r);

  r := pg_temp.try_sql('A', format('delete from public.club_members where club_id = %L and user_id = %L',
    pg_temp.club('C'), pg_temp.uid('A')));
  perform pg_temp.ok('64 admin: can leave while another admin remains', r = 'ok', r);

  r := pg_temp.try_sql('K', format('delete from public.club_members where club_id = %L and user_id = %L',
    pg_temp.club('C'), pg_temp.uid('M')));
  perform pg_temp.ok('65 coordinator: still can''t remove the second admin', r like '%only a club admin or a super admin%', r);

  r := pg_temp.try_sql('S', format('insert into public.club_members (club_id, user_id, role, status) values (%L, %L, %L, %L)',
    pg_temp.club('C'), pg_temp.uid('X'), 'admin', 'approved'));
  perform pg_temp.ok('66 super admin: adds an admin', r = 'ok', r);

  -- A rejects M's admin row: M is left with a rejected admin row, and
  -- "Request again" (requestToJoin) deletes it before re-applying.
  r := pg_temp.try_sql('A', format('update public.club_members set status = %L where club_id = %L and user_id = %L',
    'rejected', pg_temp.club('C'), pg_temp.uid('M')), true);
  perform pg_temp.ok('67 admin: rejects the other admin', r = 'ok' and pg_temp.approved_admins('C') = 1, r);

  r := pg_temp.try_sql('M', format('delete from public.club_members where club_id = %L and user_id = %L',
    pg_temp.club('C'), pg_temp.uid('M')));
  perform pg_temp.ok('68 rejected admin: can still delete their own row ("Request again")', r = 'ok', r);

  r := pg_temp.try_sql('M', format('update public.club_members set status = %L where club_id = %L and user_id = %L',
    'approved', pg_temp.club('C'), pg_temp.uid('M')));
  perform pg_temp.ok('69 rejected admin: can''t re-approve themselves (RLS: 0 rows)', r = '0 rows', r);
end $$;

-- identity never changes
do $$
declare r text;
begin
  r := pg_temp.try_sql('A', format('update public.club_members set user_id = %L where club_id = %L and user_id = %L',
    pg_temp.uid('X'), pg_temp.club('C'), pg_temp.uid('K')));
  perform pg_temp.ok('70 admin: can''t move a membership to another person',
    r like '%can''t be moved to another club or person%', r);

  r := pg_temp.try_sql('S', format('update public.club_members set user_id = %L where club_id = %L and user_id = %L',
    pg_temp.uid('X'), pg_temp.club('C'), pg_temp.uid('K')));
  perform pg_temp.ok('71 super admin: can''t move a membership to another person',
    r like '%can''t be moved to another club or person%', r);

  r := pg_temp.try_sql('S', format('update public.club_members set club_id = %L where club_id = %L and user_id = %L',
    pg_temp.club('D'), pg_temp.club('C'), pg_temp.uid('K')));
  perform pg_temp.ok('72 super admin: can''t move a membership to another club',
    r like '%can''t be moved to another club or person%', r);

  r := pg_temp.try_sql('K', format('update public.club_members set user_id = %L where club_id = %L and user_id = %L',
    pg_temp.uid('X'), pg_temp.club('C'), pg_temp.uid('M')));
  perform pg_temp.ok('73 coordinator: can''t move a member row to another person',
    r like '%can''t be moved to another club or person%', r);
end $$;

-- club creation through the API still makes the creator an admin
do $$
declare r text;
begin
  r := pg_temp.try_sql('S', format('insert into public.clubs (id, name, slug, verified, created_by) values (%L, %L, %L, true, %L)',
    '00000000-0000-0000-005e-00000000c010', 'SH New One', 'sh-new-one', pg_temp.uid('X')), true);
  perform pg_temp.ok('80 super admin: creates a club for another user, who becomes its approved admin',
    r = 'ok' and exists (select 1 from public.club_members
                         where club_id = '00000000-0000-0000-005e-00000000c010'
                           and user_id = pg_temp.uid('X') and role = 'admin' and status = 'approved'), r);

  r := pg_temp.try_sql('S', format('insert into public.clubs (id, name, slug, verified, created_by) values (%L, %L, %L, false, %L)',
    '00000000-0000-0000-005e-00000000c011', 'SH New Two', 'sh-new-two', pg_temp.uid('S')), true);
  perform pg_temp.ok('81 super admin: creates a club for themselves and becomes its admin',
    r = 'ok' and exists (select 1 from public.club_members
                         where club_id = '00000000-0000-0000-005e-00000000c011'
                           and user_id = pg_temp.uid('S') and role = 'admin' and status = 'approved'), r);

  r := pg_temp.try_sql('A', format('insert into public.clubs (id, name, slug, verified, created_by) values (%L, %L, %L, false, %L)',
    '00000000-0000-0000-005e-00000000c012', 'SH New Three', 'sh-new-three', pg_temp.uid('A')));
  perform pg_temp.ok('82 club admin: still can''t create a club', r like '%row-level security%', r);
end $$;
reset role;

-- the owner (SQL editor) is bound too, apart from the new-club exception
do $$
declare r text;
begin
  perform set_config('request.jwt.claims', '', true);
  r := pg_temp.try_sql(null, format('delete from public.club_members where club_id = %L and user_id = %L',
    pg_temp.club('D'), pg_temp.uid('O')));
  perform pg_temp.ok('83 owner with no auth.uid(): can''t remove an admin',
    r like '%only a club admin or a super admin%', r);

  -- The new-club exception needs a nested insert (handle_new_club): a direct
  -- insert of the first admin row of an empty club isn't let through.
  r := pg_temp.try_sql(null, format('insert into public.club_members (club_id, user_id, role, status) values (%L, %L, %L, %L)',
    pg_temp.club('U'), pg_temp.uid('X'), 'admin', 'approved'));
  perform pg_temp.ok('84 owner with no auth.uid(): direct insert of an admin row is refused',
    r like '%only a club admin or a super admin%', r);

  -- Acting as a super admin for the transaction works (the documented way).
  r := pg_temp.try_sql('S', format('insert into public.club_members (club_id, user_id, role, status) values (%L, %L, %L, %L)',
    pg_temp.club('U'), pg_temp.uid('M'), 'admin', 'approved'), true);
  perform pg_temp.ok('85 owner acting as a super admin: adds an admin (kept: M is now U''s only admin)',
    r = 'ok' and pg_temp.approved_admins('U') = 1, r);

  r := pg_temp.try_sql('S', format('delete from public.club_members where club_id = %L and user_id = %L',
    pg_temp.club('D'), pg_temp.uid('O')));
  perform pg_temp.ok('86 owner acting as a super admin: still can''t remove the last admin',
    r like '%must keep at least one approved admin%', r);
end $$;

-- cascades always pass
-- (M, not O or X: deleting the account of a club's creator is refused by
-- prevent_club_protected_field_changes when clubs.created_by is set to null.
-- That predates this migration and is out of its scope.)
do $$
declare r text;
begin
  perform set_config('request.jwt.claims', '', true);
  r := pg_temp.try_sql(null, format('delete from auth.users where id = %L', pg_temp.uid('M')));
  perform pg_temp.ok('87 cascade: deleting the account of a club''s only admin still works',
    r = 'ok', r);

  r := pg_temp.try_sql(null, format('delete from public.clubs where id = %L', pg_temp.club('C')));
  perform pg_temp.ok('88 cascade: deleting a club (with its last admin) still works', r = 'ok', r);
end $$;

set local role authenticated;
do $$
declare r text;
begin
  r := pg_temp.try_sql('S', format('delete from public.clubs where id = %L', pg_temp.club('C')));
  perform pg_temp.ok('89 cascade: super admin deletes a club through the API', r = 'ok', r);
end $$;

-- ------------------------------------------------ 3. handle and URL CHECKs (L1)
do $$
declare
  r text;
  bad text;
  good text;
begin
  foreach bad in array array['bad handle', 'javascript:alert(1)', 'x/../evil', 'a"b', '', '@',
                             repeat('a', 31), '@' || repeat('a', 31), 'dtu,robotics', 'ü_club'] loop
    r := pg_temp.try_sql('A', format('update public.clubs set instagram_handle = %L where id = %L',
      bad, pg_temp.club('C')));
    perform pg_temp.ok('90 handle refused: ' || quote_literal(left(bad, 40)),
      r like '%violates check constraint "clubs_instagram_handle_format"%', r);
  end loop;

  foreach good in array array['dtu_robotics', '@dtu.robotics', 'A1', repeat('a', 30), '@' || repeat('a', 30)] loop
    r := pg_temp.try_sql('A', format('update public.clubs set instagram_handle = %L where id = %L',
      good, pg_temp.club('C')));
    perform pg_temp.ok('91 handle accepted: ' || quote_literal(left(good, 40)), r = 'ok', r);
  end loop;

  r := pg_temp.try_sql('S', format('update public.clubs set instagram_handle = %L where id = %L',
    'bad handle', pg_temp.club('C')));
  perform pg_temp.ok('92 handle: super admin is bound too', r like '%clubs_instagram_handle_format%', r);

  foreach bad in array array['javascript:alert(1)', 'JavaScript:alert(1)//https://x',
                             'data:image/png;base64,AAAA', 'http://evil.example/a.png',
                             '//evil.example/a.png', ' https://e.example/a.png',
                             'http://127.0.0.1:54321/auth/v1/user', 'http://localhost:8080/a.png',
                             'http://127.0.0.1:54321.evil.example/storage/v1/object/public/a.png'] loop
    r := pg_temp.try_sql('A', format('update public.clubs set logo_url = %L where id = %L',
      bad, pg_temp.club('C')));
    perform pg_temp.ok('93 logo_url refused: ' || quote_literal(left(bad, 50)),
      r like '%violates check constraint "clubs_logo_url_https"%', r);

    r := pg_temp.try_sql('A', format('update public.events set banner_url = %L where slug = %L',
      bad, 'sh-event'));
    perform pg_temp.ok('94 banner_url refused: ' || quote_literal(left(bad, 50)),
      r like '%violates check constraint "events_banner_url_https"%', r);
  end loop;

  r := pg_temp.try_sql('A', format('update public.clubs set logo_url = %L where id = %L',
    rpad('https://x.supabase.co/storage/v1/object/public/', 501, 'a'), pg_temp.club('C')));
  perform pg_temp.ok('95 logo_url: 501 characters refused', r like '%violates check constraint "clubs_logo_url_length"%', r);

  r := pg_temp.try_sql('A', format('update public.events set banner_url = %L where slug = %L',
    rpad('https://x.supabase.co/storage/v1/object/public/', 501, 'a'), 'sh-event'));
  perform pg_temp.ok('96 banner_url: 501 characters refused', r like '%violates check constraint "events_banner_url_length"%', r);

  foreach good in array array['https://abc.supabase.co/storage/v1/object/public/event-banners/x.jpg',
                              'HTTPS://abc.supabase.co/storage/v1/object/public/event-banners/x.jpg',
                              'http://127.0.0.1:54321/storage/v1/object/public/event-banners/x.jpg',
                              'http://localhost:54321/storage/v1/object/public/event-banners/x.jpg',
                              rpad('https://x.supabase.co/storage/v1/object/public/', 500, 'a')] loop
    r := pg_temp.try_sql('A', format('update public.clubs set logo_url = %L where id = %L',
      good, pg_temp.club('C')));
    perform pg_temp.ok('97 logo_url accepted: ' || quote_literal(left(good, 50)), r = 'ok', r);

    r := pg_temp.try_sql('A', format('update public.events set banner_url = %L where slug = %L',
      good, 'sh-event'));
    perform pg_temp.ok('98 banner_url accepted: ' || quote_literal(left(good, 50)), r = 'ok', r);
  end loop;

  r := pg_temp.try_sql('S', format('update public.events set banner_url = %L where slug = %L',
    'javascript:alert(1)', 'sh-event'));
  perform pg_temp.ok('99 banner_url: super admin is bound too', r like '%events_banner_url_https%', r);

  r := pg_temp.try_sql('A', format('insert into public.events (club_id, title, slug, venue, start_at, end_at, banner_url, created_by) values (%L, %L, %L, %L, now() + interval ''5 days'', now() + interval ''5 days 1 hour'', %L, %L)',
    pg_temp.club('C'), 'SH Bad', 'sh-bad', 'Hall', 'data:text/html,<script>alert(1)</script>', pg_temp.uid('A')));
  perform pg_temp.ok('100 banner_url: a new event with a data: banner is refused', r like '%events_banner_url_https%', r);

  r := pg_temp.try_sql('A', format('update public.clubs set logo_url = null, instagram_handle = null where id = %L',
    pg_temp.club('C')));
  perform pg_temp.ok('101 logo_url and handle: null still allowed', r = 'ok', r);
end $$;

-- ------------------------------------------------ 4. event-banners listing
do $$
begin
  perform pg_temp.as_user('X');
  perform pg_temp.ok('110 student: can''t list event-banners',
    not exists (select 1 from storage.objects where bucket_id = 'event-banners'));

  perform pg_temp.as_user('O');
  perform pg_temp.ok('111 another club''s admin: can''t list this club''s banners',
    not exists (select 1 from storage.objects where bucket_id = 'event-banners'
                and name like pg_temp.club('C') || '/%'));

  perform pg_temp.as_user('A');
  perform pg_temp.ok('112 club admin: still lists their club''s banner',
    exists (select 1 from storage.objects where bucket_id = 'event-banners'
            and name = pg_temp.club('C') || '/sh-banner.jpg'));

  perform pg_temp.as_user('K');
  perform pg_temp.ok('113 coordinator: still lists their club''s banner',
    exists (select 1 from storage.objects where bucket_id = 'event-banners'
            and name = pg_temp.club('C') || '/sh-banner.jpg'));

  perform pg_temp.as_user('S');
  perform pg_temp.ok('114 super admin: still lists every banner',
    exists (select 1 from storage.objects where bucket_id = 'event-banners'
            and name = pg_temp.club('C') || '/sh-banner.jpg'));
end $$;

do $$
declare r text;
begin
  r := pg_temp.try_sql('K', format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
    'event-banners', pg_temp.club('C') || '/sh-upload.jpg', pg_temp.uid('K')));
  perform pg_temp.ok('115 coordinator: can still upload to their club''s folder', r = 'ok', r);

  r := pg_temp.try_sql('X', format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
    'event-banners', pg_temp.club('C') || '/sh-x.jpg', pg_temp.uid('X')));
  perform pg_temp.ok('116 student: still can''t upload', r like '%row-level security%', r);
end $$;
reset role;

set local role anon;
select pg_temp.as_user(null);
do $$
begin
  perform pg_temp.ok('117 anon: can''t list event-banners',
    not exists (select 1 from storage.objects where bucket_id = 'event-banners'));
end $$;
reset role;

do $$
begin
  perform pg_temp.ok('118 bucket is still public (public URLs keep working)',
    (select public from storage.buckets where id = 'event-banners'));
end $$;

-- ------------------------------------------------ 5. TRUNCATE
do $$
declare r text;
begin
  perform pg_temp.ok('120 no public table grants TRUNCATE to anon or authenticated',
    not exists (
      select 1 from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        and (has_table_privilege('anon', c.oid, 'TRUNCATE')
             or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))),
    (select string_agg(c.relname, ', ') from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       and (has_table_privilege('anon', c.oid, 'TRUNCATE')
            or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))));

  perform pg_temp.ok('121 SELECT etc. are still granted as before (clubs)',
    has_table_privilege('anon', 'public.clubs', 'SELECT')
    and has_table_privilege('authenticated', 'public.clubs', 'SELECT,INSERT,UPDATE,DELETE'));

  -- a new table created by postgres gets no TRUNCATE for the API roles
  create table public.sh_default_acl_probe (id int);
  perform pg_temp.ok('122 new table: no TRUNCATE for anon/authenticated by default',
    not has_table_privilege('anon', 'public.sh_default_acl_probe', 'TRUNCATE')
    and not has_table_privilege('authenticated', 'public.sh_default_acl_probe', 'TRUNCATE')
    and has_table_privilege('authenticated', 'public.sh_default_acl_probe', 'SELECT'));
  drop table public.sh_default_acl_probe;
end $$;

set local role authenticated;
do $$
declare r text;
begin
  r := pg_temp.try_sql('S', 'truncate public.events cascade');
  perform pg_temp.ok('123 super admin over the API: TRUNCATE is refused', r like '%permission denied%', r);
end $$;
reset role;

-- ------------------------------------------------ 6. installed shape
do $$
begin
  perform pg_temp.ok('130 install: guard trigger fires before insert, update and delete on club_members',
    (select tgenabled = 'O' and (tgtype & 2) = 2 and (tgtype & 4) = 4 and (tgtype & 8) = 8 and (tgtype & 16) = 16
     from pg_trigger
     where tgrelid = 'public.club_members'::regclass and tgname = 'club_members_guard_admin_changes'));

  perform pg_temp.ok('131 install: guard function is security definer, owned by postgres, not executable by API roles',
    (select p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
            and not has_function_privilege('anon', p.oid, 'EXECUTE')
            and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
     from pg_proc p where p.oid = 'public.guard_club_member_admin_changes()'::regprocedure));

  perform pg_temp.ok('132 install: helpers still security definer, owned by postgres, executable by anon (policies need it)',
    (select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
                     and has_function_privilege('anon', p.oid, 'EXECUTE')
                     and p.prosrc like '%auth.uid()%')
     from pg_proc p
     where p.oid in ('public.is_super_admin(uuid)'::regprocedure,
                     'public.is_club_manager(uuid, uuid)'::regprocedure)));

  perform pg_temp.ok('133 install: club_members policies unchanged',
    (select array_agg(policyname::text order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'club_members')
    = array['club_members_delete_self_or_manager', 'club_members_insert_self_request_or_manager',
            'club_members_select_self_or_manager', 'club_members_update_manager']);

  perform pg_temp.ok('134 install: event-banners policies are select (authenticated), insert, update, delete',
    (select array_agg(policyname::text || ':' || array_to_string(roles, ',') order by policyname)
     from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'event_banners_%')
    = array['event_banners_delete_club_manager:authenticated',
            'event_banners_insert_club_manager:authenticated',
            'event_banners_select_club_manager:authenticated',
            'event_banners_update_club_manager:authenticated'],
    (select string_agg(policyname || ':' || array_to_string(roles, ','), ', ' order by policyname)
     from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'event_banners_%'));
end $$;

-- ---------------------------------------------------------------- report
select n, case when pass then 'PASS' else 'FAIL' end as result, name, detail
from t_results order by n;

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed
from t_results;

rollback;
