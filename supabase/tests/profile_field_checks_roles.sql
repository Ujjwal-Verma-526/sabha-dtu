-- Role tests for 20260901000001_profile_field_checks.sql.
-- Runs entirely inside one transaction and ends in ROLLBACK: nothing persists.
-- LOCAL STACK ONLY. Never run against the live project.
--
--   npx supabase start
--   docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/profile_field_checks_roles.sql
--
-- Every row of the final report should say PASS.
--
-- The rules: name not blank and <= 100 characters, roll_number <= 30,
-- branch <= 100, avatar_url <= 500 and starting with http:// or https://.
-- They bind every writer. Sign-up (handle_new_auth_user) must never trip
-- them, whatever the auth metadata holds.
--
-- Actors:  A, B = students, S = super_admin.
-- A user is simulated with SET LOCAL ROLE authenticated + a request.jwt.claims
-- `sub`, which is what auth.uid() reads: the same path a PATCH to
-- /rest/v1/users takes through PostgREST, skipping the /profile form.
-- Sign-up is simulated by inserting into auth.users, which is what GoTrue
-- does for magic link and Google alike.

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
  select ('00000000-0000-0000-00fc-0000000000' || case $1
    when 'A' then 'a1' when 'B' then 'a2' when 'S' then 'd1' end)::uuid;
$$;

-- Updates one text column of `target`'s profile as `who` (or as anon when
-- who is null) and returns 'ok', '0 rows' (RLS matched nothing) or the error
-- text. The exception block rolls back just that update.
create function pg_temp.try_update(who text, target text, col text, val text)
returns text language plpgsql as $$
declare
  n integer;
begin
  perform set_config('request.jwt.claims',
    case when who is null then json_build_object('role', 'anon')::text
         else json_build_object('sub', pg_temp.uid(who), 'role', 'authenticated')::text end,
    true);
  -- %L (an untyped literal) so 'role' gets cast to the enum like PostgREST does.
  execute format('update public.users set %I = %L where id = %L', col, val, pg_temp.uid(target));
  get diagnostics n = row_count;
  return case when n = 0 then '0 rows' else 'ok' end;
exception when others then
  return sqlerrm;
end $$;

-- Signs a new user up the way GoTrue does and returns 'ok' or the error.
create function pg_temp.try_sign_up(id uuid, email text, meta jsonb)
returns text language plpgsql as $$
begin
  insert into auth.users (id, email, raw_user_meta_data) values (id, email, meta);
  return 'ok';
exception when others then
  return sqlerrm;
end $$;

create function pg_temp.profile(id uuid) returns public.users
language sql stable as $$
  select * from public.users u where u.id = $1;
$$;

-- Shaped like the avatar_url / picture Google sends (lh3.googleusercontent.com
-- photo link, about 100 characters); not a real account's photo.
create function pg_temp.google_avatar() returns text language sql immutable as $$
  select 'https://lh3.googleusercontent.com/a/ACg8ocJq3VZ7rT0kqY2bJmXc4N9hWQ8pU1sF6dK3eR5tYv2xZ0wABCDE=s96-c';
$$;

-- ---------------------------------------------------------------- setup (owner)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-00fc-0000000000a1', 'pf-a@test.local', '{"name":"Student A"}'),
  ('00000000-0000-0000-00fc-0000000000a2', 'pf-b@test.local', '{"name":"Student B"}'),
  ('00000000-0000-0000-00fc-0000000000d1', 'pf-s@test.local', '{"name":"Super S"}');

set local session_replication_role = replica;
update public.users set role = 'super_admin' where id = pg_temp.uid('S');
set local session_replication_role = origin;

-- ------------------------------------------------ 1. sign-up never trips a check
do $$
declare
  r text;
  p public.users;
begin
  r := pg_temp.try_sign_up('00000000-0000-0000-00fc-000000000101', 'magic.link@test.local', '{}');
  p := pg_temp.profile('00000000-0000-0000-00fc-000000000101');
  perform pg_temp.ok('01 sign-up: magic link (empty metadata) signs up, name from the email',
    r = 'ok' and p.name = 'magic.link' and p.avatar_url is null, r || ' / ' || coalesce(p.name, 'no row'));

  r := pg_temp.try_sign_up('00000000-0000-0000-00fc-000000000102', 'google.user@test.local',
    jsonb_build_object('iss', 'https://accounts.google.com', 'sub', '1234567890',
      'full_name', 'Google User', 'name', 'Google User', 'email_verified', true,
      'avatar_url', pg_temp.google_avatar(), 'picture', pg_temp.google_avatar()));
  p := pg_temp.profile('00000000-0000-0000-00fc-000000000102');
  perform pg_temp.ok('02 sign-up: Google metadata signs up, name from full_name, avatar not copied',
    r = 'ok' and p.name = 'Google User' and p.avatar_url is null, r || ' / ' || coalesce(p.name, 'no row'));

  r := pg_temp.try_sign_up('00000000-0000-0000-00fc-000000000103', 'bad.avatar@test.local',
    '{"full_name":"Bad Avatar","avatar_url":"javascript:alert(document.cookie)","picture":"data:text/html,<script>alert(1)</script>"}');
  p := pg_temp.profile('00000000-0000-0000-00fc-000000000103');
  perform pg_temp.ok('03 sign-up: javascript:/data: avatar in metadata still signs up; avatar_url stays null',
    r = 'ok' and p.name = 'Bad Avatar' and p.avatar_url is null, r);

  r := pg_temp.try_sign_up('00000000-0000-0000-00fc-000000000104', 'long.avatar@test.local',
    jsonb_build_object('full_name', 'Long Avatar', 'avatar_url', rpad('https://e.example/', 2000, 'a')));
  p := pg_temp.profile('00000000-0000-0000-00fc-000000000104');
  perform pg_temp.ok('04 sign-up: 2000-character avatar in metadata still signs up; avatar_url stays null',
    r = 'ok' and p.avatar_url is null, r);

  r := pg_temp.try_sign_up('00000000-0000-0000-00fc-000000000105', 'long.name@test.local',
    jsonb_build_object('full_name', repeat('N', 300)));
  p := pg_temp.profile('00000000-0000-0000-00fc-000000000105');
  perform pg_temp.ok('05 sign-up: 300-character full_name still signs up, name cut to 100',
    r = 'ok' and p.name = repeat('N', 100), r || ' / ' || coalesce(char_length(p.name)::text, 'no row'));

  r := pg_temp.try_sign_up('00000000-0000-0000-00fc-000000000106', 'hindi.name@test.local',
    jsonb_build_object('full_name', repeat('अ', 150)));
  p := pg_temp.profile('00000000-0000-0000-00fc-000000000106');
  perform pg_temp.ok('06 sign-up: 150-character Devanagari name is cut to 100 characters (not bytes)',
    r = 'ok' and char_length(p.name) = 100 and p.name = repeat('अ', 100),
    r || ' / ' || coalesce(char_length(p.name)::text, 'no row'));

  r := pg_temp.try_sign_up('00000000-0000-0000-00fc-000000000107', 'blank.full@test.local',
    '{"full_name":"   ","name":"  Real Name  "}');
  p := pg_temp.profile('00000000-0000-0000-00fc-000000000107');
  perform pg_temp.ok('07 sign-up: blank full_name is skipped, name is trimmed',
    r = 'ok' and p.name = 'Real Name', r || ' / ' || coalesce(p.name, 'no row'));

  r := pg_temp.try_sign_up('00000000-0000-0000-00fc-000000000108',
    repeat('x', 150) || '@test.local', '{"full_name":"","name":""}');
  p := pg_temp.profile('00000000-0000-0000-00fc-000000000108');
  perform pg_temp.ok('08 sign-up: no name and a 150-character email local part still signs up, cut to 100',
    r = 'ok' and p.name = repeat('x', 100), r || ' / ' || coalesce(char_length(p.name)::text, 'no row'));

  r := pg_temp.try_sign_up('00000000-0000-0000-00fc-000000000109', '  @test.local', '{"name":" "}');
  p := pg_temp.profile('00000000-0000-0000-00fc-000000000109');
  perform pg_temp.ok('09 sign-up: nothing usable at all falls back to "New user"',
    r = 'ok' and p.name = 'New user', r || ' / ' || coalesce(p.name, 'no row'));

  r := pg_temp.try_sign_up('00000000-0000-0000-00fc-000000000110', 'number.name@test.local',
    '{"full_name":12345}');
  p := pg_temp.profile('00000000-0000-0000-00fc-000000000110');
  perform pg_temp.ok('10 sign-up: a non-string full_name is stored as its text',
    r = 'ok' and p.name = '12345', r || ' / ' || coalesce(p.name, 'no row'));

  r := pg_temp.try_sign_up('00000000-0000-0000-00fc-000000000111', 'null.meta@test.local', null);
  p := pg_temp.profile('00000000-0000-0000-00fc-000000000111');
  perform pg_temp.ok('11 sign-up: null metadata signs up, name from the email',
    r = 'ok' and p.name = 'null.meta', r || ' / ' || coalesce(p.name, 'no row'));
end $$;

-- A later sign-in (GoTrue refreshes raw_user_meta_data from Google) is an
-- UPDATE on auth.users: no trigger copies anything, so it can't trip a check.
do $$
declare
  before_row public.users;
  after_row public.users;
  r text;
begin
  before_row := pg_temp.profile('00000000-0000-0000-00fc-000000000102');
  begin
    update auth.users
      set raw_user_meta_data = jsonb_build_object('full_name', repeat('Z', 500),
            'avatar_url', 'javascript:alert(1)'),
          last_sign_in_at = now()
      where id = '00000000-0000-0000-00fc-000000000102';
    r := 'ok';
  exception when others then
    r := sqlerrm;
  end;
  after_row := pg_temp.profile('00000000-0000-0000-00fc-000000000102');
  perform pg_temp.ok('12 sign-in: bad metadata on a returning user succeeds and leaves the profile alone',
    r = 'ok' and after_row.name = before_row.name and after_row.avatar_url is null, r);
end $$;

-- ------------------------------------------------ 2. direct API update, own row
set local role authenticated;
do $$
declare r text;
begin
  r := pg_temp.try_update('A', 'A', 'avatar_url', 'javascript:alert(document.cookie)');
  perform pg_temp.ok('20 api: javascript: avatar_url is rejected',
    r like '%violates check constraint "users_avatar_url_web"%', r);

  r := pg_temp.try_update('A', 'A', 'avatar_url', 'JavaScript:alert(1)//https://x');
  perform pg_temp.ok('21 api: mixed-case javascript: avatar_url is rejected',
    r like '%users_avatar_url_web%', r);

  r := pg_temp.try_update('A', 'A', 'avatar_url', 'data:text/html,<script>alert(1)</script>');
  perform pg_temp.ok('22 api: data: avatar_url is rejected', r like '%users_avatar_url_web%', r);

  r := pg_temp.try_update('A', 'A', 'avatar_url', ' https://e.example/a.png');
  perform pg_temp.ok('23 api: avatar_url with a leading space is rejected', r like '%users_avatar_url_web%', r);

  r := pg_temp.try_update('A', 'A', 'avatar_url', '//evil.example/a.png');
  perform pg_temp.ok('24 api: protocol-relative avatar_url is rejected', r like '%users_avatar_url_web%', r);

  r := pg_temp.try_update('A', 'A', 'avatar_url', 'ftp://e.example/a.png');
  perform pg_temp.ok('25 api: ftp: avatar_url is rejected', r like '%users_avatar_url_web%', r);

  r := pg_temp.try_update('A', 'A', 'avatar_url', rpad('https://e.example/', 501, 'a'));
  perform pg_temp.ok('26 api: 501-character avatar_url is rejected',
    r like '%violates check constraint "users_avatar_url_length"%', r);

  r := pg_temp.try_update('A', 'A', 'avatar_url', rpad('https://e.example/', 500, 'a'));
  perform pg_temp.ok('27 api: 500-character avatar_url is accepted', r = 'ok', r);

  r := pg_temp.try_update('A', 'A', 'avatar_url', pg_temp.google_avatar());
  perform pg_temp.ok('28 api: a Google-shaped avatar URL fits the cap and is accepted',
    r = 'ok' and char_length(pg_temp.google_avatar()) < 500,
    r || ' / ' || char_length(pg_temp.google_avatar()) || ' characters');

  r := pg_temp.try_update('A', 'A', 'avatar_url', 'HTTP://E.EXAMPLE/A.PNG');
  perform pg_temp.ok('29 api: upper-case HTTP:// is accepted (the form accepts it too)', r = 'ok', r);

  r := pg_temp.try_update('A', 'A', 'name', repeat('n', 101));
  perform pg_temp.ok('30 api: 101-character name is rejected',
    r like '%violates check constraint "users_name_length"%', r);

  r := pg_temp.try_update('A', 'A', 'name', repeat('n', 100));
  perform pg_temp.ok('31 api: 100-character name is accepted', r = 'ok', r);

  r := pg_temp.try_update('A', 'A', 'name', repeat('अ', 101));
  perform pg_temp.ok('32 api: 101-character Devanagari name is rejected (characters, not bytes)',
    r like '%users_name_length%', r);

  r := pg_temp.try_update('A', 'A', 'name', repeat('अ', 100));
  perform pg_temp.ok('33 api: 100-character Devanagari name (300 bytes) is accepted', r = 'ok', r);

  r := pg_temp.try_update('A', 'A', 'name', '');
  perform pg_temp.ok('34 api: empty name is rejected',
    r like '%violates check constraint "users_name_not_blank"%', r);

  r := pg_temp.try_update('A', 'A', 'name', '    ');
  perform pg_temp.ok('35 api: all-space name is rejected', r like '%users_name_not_blank%', r);

  r := pg_temp.try_update('A', 'A', 'roll_number', repeat('9', 31));
  perform pg_temp.ok('36 api: 31-character roll_number is rejected',
    r like '%violates check constraint "users_roll_number_length"%', r);

  r := pg_temp.try_update('A', 'A', 'roll_number', repeat('9', 30));
  perform pg_temp.ok('37 api: 30-character roll_number is accepted', r = 'ok', r);

  r := pg_temp.try_update('A', 'A', 'branch', repeat('b', 101));
  perform pg_temp.ok('38 api: 101-character branch is rejected',
    r like '%violates check constraint "users_branch_length"%', r);

  r := pg_temp.try_update('A', 'A', 'branch', repeat('b', 100));
  perform pg_temp.ok('39 api: 100-character branch is accepted', r = 'ok', r);

  r := pg_temp.try_update('A', 'A', 'branch', repeat('b', 1000000));
  perform pg_temp.ok('40 api: a megabyte branch is rejected', r like '%users_branch_length%', r);
end $$;

-- A normal update, shaped exactly like the one the /profile form sends.
do $$
declare n integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.uid('A'), 'role', 'authenticated')::text, true);
  update public.users
    set name = 'Ujjwal Test', roll_number = '2K25/ME/123', branch = 'Mechanical Engineering',
        batch_year = 2029, avatar_url = 'https://avatars.example.com/u/123.png'
    where id = pg_temp.uid('A');
  get diagnostics n = row_count;
  perform pg_temp.ok('41 api: a normal full profile update works', n = 1, n || ' row(s)');

  update public.users
    set roll_number = null, branch = null, batch_year = null, avatar_url = null
    where id = pg_temp.uid('A');
  get diagnostics n = row_count;
  perform pg_temp.ok('42 api: clearing the optional fields to null works', n = 1, n || ' row(s)');

  update public.users
    set name = 'Ujjwal Test', roll_number = '2K25/ME/123', branch = 'Mechanical Engineering',
        batch_year = 2029, avatar_url = 'https://avatars.example.com/u/123.png'
    where id = pg_temp.uid('A');
end $$;

-- Rejected updates left nothing behind.
do $$
declare r text;
begin
  r := pg_temp.try_update('A', 'A', 'avatar_url', 'javascript:alert(1)');
end $$;
reset role;
do $$
declare p public.users;
begin
  p := pg_temp.profile(pg_temp.uid('A'));
  perform pg_temp.ok('43 api: after a rejected update the profile still holds the last good values',
    p.name = 'Ujjwal Test' and p.roll_number = '2K25/ME/123' and p.branch = 'Mechanical Engineering'
      and p.batch_year = 2029 and p.avatar_url = 'https://avatars.example.com/u/123.png',
    coalesce(p.avatar_url, 'null'));
end $$;

-- ------------------------------------------------ 3. every writer, RLS unchanged
set local role authenticated;
do $$
declare r text;
begin
  r := pg_temp.try_update('S', 'A', 'avatar_url', 'javascript:alert(1)');
  perform pg_temp.ok('50 super_admin: javascript: avatar_url on someone else''s profile is rejected too',
    r like '%users_avatar_url_web%', r);

  r := pg_temp.try_update('S', 'A', 'name', repeat('s', 101));
  perform pg_temp.ok('51 super_admin: over-long name is rejected too', r like '%users_name_length%', r);

  r := pg_temp.try_update('S', 'A', 'branch', 'Civil Engineering');
  perform pg_temp.ok('52 super_admin: a normal update of another profile still works', r = 'ok', r);

  r := pg_temp.try_update('A', 'B', 'name', 'Hijacked');
  perform pg_temp.ok('53 rls: a student still cannot update someone else''s profile', r = '0 rows', r);

  r := pg_temp.try_update('A', 'A', 'role', 'super_admin');
  perform pg_temp.ok('54 rls: a student still cannot change their own role',
    r like '%not permitted to change role%', r);
end $$;

set local role anon;
do $$
declare r text;
begin
  r := pg_temp.try_update(null, 'A', 'avatar_url', 'https://e.example/a.png');
  perform pg_temp.ok('55 rls: anon still cannot update any profile',
    r = '0 rows' or r like '%permission denied%', r);
end $$;
reset role;

do $$
declare p public.users;
begin
  p := pg_temp.profile(pg_temp.uid('B'));
  perform pg_temp.ok('56 rls: B''s profile is untouched', p.name = 'Student B', p.name);
end $$;

-- ------------------------------------------------ 4. what is installed
do $$
begin
  perform pg_temp.ok('60 install: all six CHECKs exist and are validated',
    (select count(*) from pg_constraint
     where conrelid = 'public.users'::regclass and contype = 'c' and convalidated
       and conname in ('users_name_not_blank', 'users_name_length', 'users_roll_number_length',
                       'users_branch_length', 'users_avatar_url_length', 'users_avatar_url_web')) = 6);

  -- The limits profile-form.ts mirrors. If one of these fails, the migration
  -- and src/lib/profile-form.ts (PROFILE_MAX_LENGTH, WEB_URL_PREFIX) disagree.
  perform pg_temp.ok('61 install: limits are name 100, roll_number 30, branch 100, avatar_url 500, http(s) prefix',
    (select bool_and(pg_get_constraintdef(oid) like expected)
     from pg_constraint c
     join (values ('users_name_length', '%char_length(name) <= 100%'),
                  ('users_roll_number_length', '%char_length(roll_number) <= 30%'),
                  ('users_branch_length', '%char_length(branch) <= 100%'),
                  ('users_avatar_url_length', '%char_length(avatar_url) <= 500%'),
                  ('users_avatar_url_web', '%avatar_url ~* ''^https?://''::text%')) as e(conname, expected)
       on e.conname = c.conname
     where c.conrelid = 'public.users'::regclass)
    and (select count(*) from pg_constraint
         where conrelid = 'public.users'::regclass
           and conname in ('users_name_length', 'users_roll_number_length', 'users_branch_length',
                           'users_avatar_url_length', 'users_avatar_url_web')) = 5);

  perform pg_temp.ok('62 install: handle_new_auth_user is security definer, owned by postgres, never copies an avatar',
    (select p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
            and p.prosrc not ilike '%avatar%' and p.prosrc not ilike '%picture%'
     from pg_proc p where p.oid = 'public.handle_new_auth_user()'::regprocedure));

  perform pg_temp.ok('63 install: RLS still on, users policies unchanged',
    (select relrowsecurity from pg_class where oid = 'public.users'::regclass)
    and (select array_agg(policyname::text order by policyname) from pg_policies
         where schemaname = 'public' and tablename = 'users')
        = array['users_select_own_or_super_admin', 'users_update_own', 'users_update_super_admin'],
    (select string_agg(policyname, ', ' order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'users'));
end $$;

-- ---------------------------------------------------------------- report
select n, case when pass then 'PASS' else 'FAIL' end as result, name, detail
from t_results order by n;

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed
from t_results;

rollback;
