-- Role tests for 20260904000001_event_categories.sql.
-- Runs entirely inside one transaction and ends in ROLLBACK: nothing persists.
-- LOCAL STACK ONLY. Never run against the live project.
--
--   npx supabase start
--   docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/event_categories_roles.sql
--
-- Every row of the final report should say PASS.
--
-- The rules: every event has exactly one of technical, cultural, social,
-- entrepreneurship, other (lowercase keys), for every writer including the
-- owner; an insert that names none gets 'other'. Who may write an event is
-- unchanged (a manager of its club or a super_admin, through RLS), and the
-- category is readable wherever the event is. Club categories stay free text.
--
-- Actors: A = admin (creator) of club C, K = approved coordinator of C,
-- P = pending admin request on C, B = admin (creator) of club D, X = student,
-- S = super_admin, anon = not signed in.
-- A user is simulated with SET LOCAL ROLE authenticated + a request.jwt.claims
-- `sub`, which is what auth.uid() reads: the path a request to /rest/v1/events
-- takes through PostgREST.

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
  select ('00000000-0000-0000-00ec-0000000000' || case $1
    when 'A' then 'a1' when 'K' then 'b1' when 'P' then 'c1'
    when 'B' then 'd1' when 'X' then 'e1' when 'S' then 'f1' end)::uuid;
$$;

create function pg_temp.club(which text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-00ec-00000000c' || case $1
    when 'C' then '001' when 'D' then '002' end)::uuid;
$$;

create function pg_temp.event(which text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-00ec-00000000e' || case $1
    when 'pub' then '001' when 'draft' then '002' when 'D' then '003' end)::uuid;
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

-- Reads one value as `who` (null when the row is invisible).
create function pg_temp.read_as(who text, sql text)
returns text language plpgsql as $$
declare
  v text;
begin
  perform pg_temp.as_user(who);
  execute sql into v;
  return v;
end $$;

-- An insert of a new event into club C (or `club`), with `category_sql` as
-- the category expression, or no category column at all when it is null.
create function pg_temp.insert_sql(category_sql text, club text default 'C', creator text default 'A')
returns text language sql immutable as $$
  select format(
    'insert into public.events (club_id, title, slug, venue, start_at, end_at, created_by%s)
     values (%L, %L, %L, %L, now() + interval ''5 days'', now() + interval ''5 days 2 hours'', %L%s)',
    case when category_sql is null then '' else ', category' end,
    pg_temp.club(club), 'EC new', 'ec-new-' || md5(random()::text), 'Hall', pg_temp.uid(creator),
    case when category_sql is null then '' else ', ' || category_sql end);
$$;

-- ---------------------------------------------------------------- setup (owner)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-00ec-0000000000a1', 'ec-a@test.local', '{"name":"Admin A"}'),
  ('00000000-0000-0000-00ec-0000000000b1', 'ec-k@test.local', '{"name":"Coordinator K"}'),
  ('00000000-0000-0000-00ec-0000000000c1', 'ec-p@test.local', '{"name":"Pending P"}'),
  ('00000000-0000-0000-00ec-0000000000d1', 'ec-b@test.local', '{"name":"Admin B"}'),
  ('00000000-0000-0000-00ec-0000000000e1', 'ec-x@test.local', '{"name":"Student X"}'),
  ('00000000-0000-0000-00ec-0000000000f1', 'ec-s@test.local', '{"name":"Super S"}');

set local session_replication_role = replica;
update public.users set role = 'super_admin' where id = pg_temp.uid('S');
set local session_replication_role = origin;

-- A and B become approved admins of their clubs through handle_new_club.
insert into public.clubs (id, name, slug, category, verified, created_by) values
  (pg_temp.club('C'), 'EC Club C', 'ec-club-c', 'Robotics', true, pg_temp.uid('A')),
  (pg_temp.club('D'), 'EC Club D', 'ec-club-d', 'Cultural', true, pg_temp.uid('B'));

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('A'))::text, true);
insert into public.club_members (club_id, user_id, role, status) values
  (pg_temp.club('C'), pg_temp.uid('K'), 'coordinator', 'approved'),
  (pg_temp.club('C'), pg_temp.uid('P'), 'admin', 'pending');
select set_config('request.jwt.claims', null, true);

insert into public.events (id, club_id, title, slug, venue, start_at, end_at, status, created_by, category) values
  (pg_temp.event('pub'), pg_temp.club('C'), 'EC Published', 'ec-published', 'Hall',
   now() + interval '3 days', now() + interval '3 days 2 hours', 'published', pg_temp.uid('A'), 'technical'),
  (pg_temp.event('draft'), pg_temp.club('C'), 'EC Draft', 'ec-draft', 'Hall',
   now() + interval '4 days', now() + interval '4 days 2 hours', 'draft', pg_temp.uid('A'), 'social'),
  (pg_temp.event('D'), pg_temp.club('D'), 'EC Club D event', 'ec-club-d-event', 'Hall',
   now() + interval '3 days', now() + interval '3 days 2 hours', 'published', pg_temp.uid('B'), 'cultural');

-- ---------------------------------------------------------------- inserts (API)
set local role authenticated;

do $$
declare
  r text;
  k text;
begin
  foreach k in array array['technical', 'cultural', 'social', 'entrepreneurship', 'other'] loop
    r := pg_temp.try_sql('A', pg_temp.insert_sql(quote_literal(k)));
    perform pg_temp.ok('01 admin: insert with category ' || k || ' is accepted', r = 'ok', r);
  end loop;

  r := pg_temp.try_sql('A', pg_temp.insert_sql(null));
  perform pg_temp.ok('02 admin: insert without a category is accepted (gets the default)', r = 'ok', r);

  r := pg_temp.try_sql('A', pg_temp.insert_sql(quote_literal('Technical')));
  perform pg_temp.ok('03 admin: a capitalised name is refused (keys are lowercase)',
    r like '%events_category_valid%', r);

  r := pg_temp.try_sql('A', pg_temp.insert_sql(quote_literal(' technical')));
  perform pg_temp.ok('04 admin: surrounding whitespace is refused', r like '%events_category_valid%', r);

  r := pg_temp.try_sql('A', pg_temp.insert_sql(quote_literal('music')));
  perform pg_temp.ok('05 admin: an unknown category is refused', r like '%events_category_valid%', r);

  r := pg_temp.try_sql('A', pg_temp.insert_sql(quote_literal('')));
  perform pg_temp.ok('06 admin: an empty category is refused', r like '%events_category_valid%', r);

  r := pg_temp.try_sql('A', pg_temp.insert_sql('null'));
  perform pg_temp.ok('07 admin: a null category is refused', r like '%null value in column "category"%', r);

  r := pg_temp.try_sql('K', pg_temp.insert_sql(quote_literal('social'), 'C', 'K'));
  perform pg_temp.ok('08 coordinator: insert with a category is accepted', r = 'ok', r);

  r := pg_temp.try_sql('P', pg_temp.insert_sql(quote_literal('social'), 'C', 'P'));
  perform pg_temp.ok('09 pending admin: insert is refused by RLS', r like '%row-level security%', r);

  r := pg_temp.try_sql('X', pg_temp.insert_sql(quote_literal('social'), 'C', 'X'));
  perform pg_temp.ok('10 student: insert is refused by RLS', r like '%row-level security%', r);

  r := pg_temp.try_sql('B', pg_temp.insert_sql(quote_literal('social'), 'C', 'B'));
  perform pg_temp.ok('11 admin of another club: insert into this club is refused by RLS',
    r like '%row-level security%', r);
end $$;

-- What an insert without a category stores.
do $$
declare v text;
begin
  perform pg_temp.as_user('A');
  insert into public.events (id, club_id, title, slug, venue, start_at, end_at, created_by)
  values ('00000000-0000-0000-00ec-00000000e0ff', pg_temp.club('C'), 'EC Default', 'ec-default', 'Hall',
          now() + interval '6 days', now() + interval '6 days 1 hour', pg_temp.uid('A'))
  returning category into v;
  perform pg_temp.ok('12 an insert without a category stores ''other''', v = 'other', coalesce(v, 'null'));
end $$;

-- ---------------------------------------------------------------- updates (API)
do $$
declare r text;
begin
  r := pg_temp.try_sql('A', format('update public.events set category = %L where id = %L', 'cultural', pg_temp.event('pub')));
  perform pg_temp.ok('13 admin: changing the category of a published event works', r = 'ok', r);

  r := pg_temp.try_sql('A', format('update public.events set category = %L where id = %L', 'entrepreneurship', pg_temp.event('draft')));
  perform pg_temp.ok('14 admin: changing the category of a draft works', r = 'ok', r);

  r := pg_temp.try_sql('K', format('update public.events set category = %L where id = %L', 'social', pg_temp.event('pub')));
  perform pg_temp.ok('15 coordinator: changing the category works', r = 'ok', r);

  r := pg_temp.try_sql('A', format('update public.events set category = %L where id = %L', 'Cultural', pg_temp.event('pub')));
  perform pg_temp.ok('16 admin: updating to a capitalised name is refused', r like '%events_category_valid%', r);

  r := pg_temp.try_sql('A', format('update public.events set category = %L where id = %L', 'workshop', pg_temp.event('pub')));
  perform pg_temp.ok('17 admin: updating to an unknown category is refused', r like '%events_category_valid%', r);

  r := pg_temp.try_sql('A', format('update public.events set category = null where id = %L', pg_temp.event('pub')));
  perform pg_temp.ok('18 admin: updating to null is refused', r like '%null value in column "category"%', r);

  r := pg_temp.try_sql('P', format('update public.events set category = %L where id = %L', 'other', pg_temp.event('pub')));
  perform pg_temp.ok('19 pending admin: cannot change the category', r = '0 rows', r);

  r := pg_temp.try_sql('X', format('update public.events set category = %L where id = %L', 'other', pg_temp.event('pub')));
  perform pg_temp.ok('20 student: cannot change the category', r = '0 rows', r);

  r := pg_temp.try_sql('B', format('update public.events set category = %L where id = %L', 'other', pg_temp.event('pub')));
  perform pg_temp.ok('21 admin of another club: cannot change this club''s event', r = '0 rows', r);

  r := pg_temp.try_sql('S', format('update public.events set category = %L where id = %L', 'other', pg_temp.event('D')));
  perform pg_temp.ok('22 super_admin: can change any event''s category', r = 'ok', r);

  r := pg_temp.try_sql('S', format('update public.events set category = %L where id = %L', 'Other', pg_temp.event('D')));
  perform pg_temp.ok('23 super_admin: an invalid category is still refused', r like '%events_category_valid%', r);
end $$;

-- Club categories stay free text.
do $$
declare r text;
begin
  r := pg_temp.try_sql('A', format('update public.clubs set category = %L where id = %L', 'Music & Dance', pg_temp.club('C')));
  perform pg_temp.ok('24 club categories stay free text', r = 'ok', r);
end $$;

reset role;

-- A real category change bumps updated_at (the trigger is back on). now()
-- is fixed for the transaction, so start from an older value, set with
-- triggers off.
set local session_replication_role = replica;
update public.events set updated_at = now() - interval '1 day' where id = pg_temp.event('draft');
set local session_replication_role = origin;

do $$
declare
  after_ts timestamptz;
begin
  update public.events set category = 'technical' where id = pg_temp.event('draft')
  returning updated_at into after_ts;
  perform pg_temp.ok('25 a category change bumps updated_at (events_set_updated_at is on)',
    after_ts = now(), format('updated_at = %s', after_ts));
end $$;

-- ---------------------------------------------------------------- anon
set local role anon;

do $$
declare r text;
begin
  r := pg_temp.read_as(null, format('select category from public.events where id = %L', pg_temp.event('D')));
  perform pg_temp.ok('26 anon: reads the category of a published event', r = 'cultural', coalesce(r, 'null'));

  r := pg_temp.read_as(null, format('select category from public.events where id = %L', pg_temp.event('draft')));
  perform pg_temp.ok('27 anon: a draft''s category stays hidden', r is null, coalesce(r, 'null'));

  r := pg_temp.try_sql(null, format('update public.events set category = %L where id = %L', 'other', pg_temp.event('D')));
  perform pg_temp.ok('28 anon: cannot change a category', r = '0 rows' or r like '%permission denied%', r);

  r := pg_temp.try_sql(null, pg_temp.insert_sql(quote_literal('other'), 'C', 'A'));
  perform pg_temp.ok('29 anon: cannot insert an event', r like '%permission denied%' or r like '%row-level security%', r);
end $$;

reset role;

set local role authenticated;
do $$
declare r text;
begin
  r := pg_temp.read_as('X', format('select category from public.events where id = %L', pg_temp.event('D')));
  perform pg_temp.ok('30 student: reads the category of a published event', r = 'cultural', coalesce(r, 'null'));

  r := pg_temp.read_as('X', format('select category from public.events where id = %L', pg_temp.event('draft')));
  perform pg_temp.ok('31 student: a draft''s category stays hidden', r is null, coalesce(r, 'null'));

  r := pg_temp.read_as('K', format('select category from public.events where id = %L', pg_temp.event('draft')));
  perform pg_temp.ok('32 coordinator: reads the category of the club''s draft', r = 'technical', coalesce(r, 'null'));
end $$;
reset role;

-- ---------------------------------------------------------------- owner
do $$
declare r text;
begin
  r := pg_temp.try_sql(null, format('update public.events set category = %L where id = %L', 'music', pg_temp.event('pub')));
  perform pg_temp.ok('33 owner: the CHECK binds the table owner too', r like '%events_category_valid%', r);
end $$;

-- ---------------------------------------------------------------- install
do $$
begin
  perform pg_temp.ok('34 install: category is text, not null, default ''other''',
    (select format_type(a.atttypid, a.atttypmod) = 'text' and a.attnotnull
            and pg_get_expr(d.adbin, d.adrelid) = '''other''::text'
     from pg_attribute a
     left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = 'public.events'::regclass and a.attname = 'category'));
  perform pg_temp.ok('35 install: events_category_valid is validated',
    (select convalidated from pg_constraint
     where conrelid = 'public.events'::regclass and conname = 'events_category_valid'));
  perform pg_temp.ok('36 install: events_set_updated_at is enabled',
    exists (select 1 from pg_trigger where tgrelid = 'public.events'::regclass
              and tgname = 'events_set_updated_at' and tgenabled = 'O'));
  perform pg_temp.ok('37 install: RLS still on, with the same four policies',
    (select relrowsecurity from pg_class where oid = 'public.events'::regclass)
    and (select array_agg(policyname::text order by policyname) from pg_policies
         where schemaname = 'public' and tablename = 'events')
        = array['events_delete_super_admin', 'events_insert_club_manager',
                'events_select_published_or_manager', 'events_update_club_manager']);
  perform pg_temp.ok('38 install: every existing event has a valid category',
    not exists (select 1 from public.events
                where category not in ('technical', 'cultural', 'social', 'entrepreneurship', 'other')));
end $$;

-- ---------------------------------------------------------------- report
select n, case when pass then 'PASS' else 'FAIL' end as result, name, detail
from t_results order by n;

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed
from t_results;

rollback;
