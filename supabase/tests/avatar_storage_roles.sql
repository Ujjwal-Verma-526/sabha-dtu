-- Role tests for 20260905000001_avatar_storage.sql.
-- Runs entirely inside one transaction and ends in ROLLBACK: nothing persists.
-- LOCAL STACK ONLY. Never run against the live project.
--
--   npx supabase start
--   docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/avatar_storage_roles.sql
--
-- Every row of the final report should say PASS.
--
-- What it proves:
--   1. The avatars bucket is public, 5 MB, JPEG/PNG/WebP.
--   2. A user can upload, list, replace (update) and delete objects only in
--      their own "{user_id}/" folder, exactly one level deep.
--   3. Another user, a super admin and anon can't upload into, list,
--      overwrite, move, rename or delete anything in someone else's folder.
--   4. users.avatar_url and its CHECKs are unchanged, and only the owner (or a
--      super admin) can change it.
--   5. The helper answers only for the caller and isn't callable by anon;
--      event-banners policies are untouched.
--
-- Actors: U and V = students, S = super_admin, anon.
-- A user is simulated with SET LOCAL ROLE authenticated (or anon) plus a
-- request.jwt.claims `sub`, which is what auth.uid() reads: the same path the
-- storage API takes (it runs its queries as the caller's role with the
-- caller's JWT), skipping the app.
--
-- storage.objects refuses direct DELETEs unless storage.allow_delete_query is
-- 'true' (storage.protect_delete); the storage API sets it for its own
-- deletes, so this file sets it too, locally, before the delete checks.

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
  select ('00000000-0000-0000-00a7-0000000000' || case $1
    when 'U' then 'a1' when 'V' then 'b1' when 'S' then 'f1' end)::uuid;
$$;

-- "{uid}/{file}" for `who`.
create function pg_temp.path(who text, file text) returns text language sql immutable as $$
  select pg_temp.uid(who)::text || '/' || file;
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

create function pg_temp.upload(bucket text, object_name text, who text) returns text
language sql immutable as $$
  select format('insert into storage.objects (bucket_id, name, owner, owner_id) values (%L, %L, %L, %L)',
                bucket, object_name, pg_temp.uid(who), pg_temp.uid(who)::text);
$$;

create function pg_temp.object_exists(bucket text, object_name text) returns boolean
language sql stable as $$
  select exists (select 1 from storage.objects where bucket_id = bucket and name = object_name);
$$;

-- ---------------------------------------------------------------- setup (owner)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-00a7-0000000000a1', 'av-u@test.local', '{"name":"Student U"}'),
  ('00000000-0000-0000-00a7-0000000000b1', 'av-v@test.local', '{"name":"Student V"}'),
  ('00000000-0000-0000-00a7-0000000000f1', 'av-s@test.local', '{"name":"Super S"}');

-- Same bootstrap as README: the escalation trigger blocks role changes unless
-- the caller is already a super_admin, so promote with triggers bypassed.
set local session_replication_role = replica;
update public.users set role = 'super_admin' where id = pg_temp.uid('S');
set local session_replication_role = origin;

-- U's current photo, as an upload would leave it.
insert into storage.objects (bucket_id, name, owner, owner_id)
values ('avatars', pg_temp.path('U', 'current.jpg'), pg_temp.uid('U'), pg_temp.uid('U')::text);

-- ------------------------------------------------ 1. bucket
do $$
begin
  perform pg_temp.ok('01 bucket: avatars is public (public URLs work for everyone)',
    (select public from storage.buckets where id = 'avatars'));
  perform pg_temp.ok('02 bucket: 5 MB limit, JPEG/PNG/WebP only (same as event-banners)',
    (select file_size_limit = 5242880
            and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
     from storage.buckets where id = 'avatars'),
    (select file_size_limit || ' ' || array_to_string(allowed_mime_types, ',')
     from storage.buckets where id = 'avatars'));
end $$;

-- ------------------------------------------------ 2. uploads (INSERT)
set local role authenticated;
do $$
declare r text;
begin
  r := pg_temp.try_sql('U', pg_temp.upload('avatars', pg_temp.path('U', 'new.jpg'), 'U'));
  perform pg_temp.ok('10 owner: can upload to their own folder', r = 'ok', r);

  r := pg_temp.try_sql('U', pg_temp.upload('avatars', 'loose.jpg', 'U'));
  perform pg_temp.ok('11 owner: can''t upload to the bucket root', r like '%row-level security%', r);

  r := pg_temp.try_sql('U', pg_temp.upload('avatars', pg_temp.path('U', 'deeper/x.jpg'), 'U'));
  perform pg_temp.ok('12 owner: can''t upload into a subfolder of their folder', r like '%row-level security%', r);

  r := pg_temp.try_sql('U', pg_temp.upload('avatars',
    pg_temp.uid('U')::text || '/../' || pg_temp.uid('V')::text || '/x.jpg', 'U'));
  perform pg_temp.ok('13 owner: a ../ path into another folder is refused', r like '%row-level security%', r);

  r := pg_temp.try_sql('U', pg_temp.upload('avatars', upper(pg_temp.uid('U')::text) || '/x.jpg', 'U'));
  perform pg_temp.ok('14 owner: a differently-cased copy of their id is not their folder',
    r like '%row-level security%', r);

  r := pg_temp.try_sql('V', pg_temp.upload('avatars', pg_temp.path('U', 'v.jpg'), 'V'));
  perform pg_temp.ok('15 another user: can''t upload into someone else''s folder', r like '%row-level security%', r);

  r := pg_temp.try_sql('V', pg_temp.upload('avatars', pg_temp.path('U', 'current.jpg'), 'V'));
  perform pg_temp.ok('16 another user: can''t upload over someone else''s photo', r like '%row-level security%', r);

  -- No conflict target: the unique indexes on storage.objects differ between
  -- storage versions. The storage API's own upsert is an UPDATE (test 45).
  r := pg_temp.try_sql('V', pg_temp.upload('avatars', pg_temp.path('U', 'current.jpg'), 'V')
    || ' on conflict do nothing');
  perform pg_temp.ok('17 another user: an insert-or-skip over someone else''s photo is refused',
    r like '%row-level security%', r);

  r := pg_temp.try_sql('S', pg_temp.upload('avatars', pg_temp.path('U', 's.jpg'), 'S'));
  perform pg_temp.ok('18 super admin: can''t upload into someone else''s folder', r like '%row-level security%', r);

  r := pg_temp.try_sql('U', pg_temp.upload('event-banners', pg_temp.path('U', 'x.jpg'), 'U'));
  perform pg_temp.ok('19 owner: their user folder gives no write access to event-banners',
    r like '%row-level security%', r);
end $$;
reset role;

set local role anon;
do $$
declare r text;
begin
  r := pg_temp.try_sql(null, pg_temp.upload('avatars', pg_temp.path('U', 'anon.jpg'), 'U'));
  perform pg_temp.ok('20 anon: can''t upload', r like '%row-level security%' or r like '%permission denied%', r);
end $$;
reset role;

-- ------------------------------------------------ 3. listing (SELECT)
set local role authenticated;
do $$
begin
  perform pg_temp.as_user('U');
  perform pg_temp.ok('30 owner: lists their own photo',
    pg_temp.object_exists('avatars', pg_temp.path('U', 'current.jpg')));

  perform pg_temp.as_user('V');
  perform pg_temp.ok('31 another user: can''t list anyone else''s photos',
    not exists (select 1 from storage.objects where bucket_id = 'avatars'));

  perform pg_temp.as_user('S');
  perform pg_temp.ok('32 super admin: can''t list other people''s photos',
    not exists (select 1 from storage.objects where bucket_id = 'avatars'));
end $$;
reset role;

set local role anon;
select pg_temp.as_user(null);
do $$
begin
  perform pg_temp.ok('33 anon: can''t list avatars',
    not exists (select 1 from storage.objects where bucket_id = 'avatars'));
end $$;
reset role;

-- ------------------------------------------------ 4. replace / move (UPDATE)
set local role authenticated;
do $$
declare r text;
begin
  r := pg_temp.try_sql('U', format(
    'update storage.objects set metadata = ''{"size": 1}''::jsonb where bucket_id = ''avatars'' and name = %L',
    pg_temp.path('U', 'current.jpg')));
  perform pg_temp.ok('40 owner: can replace (update) their own photo', r = 'ok', r);

  r := pg_temp.try_sql('U', format(
    'update storage.objects set name = %L where bucket_id = ''avatars'' and name = %L',
    pg_temp.path('U', 'renamed.jpg'), pg_temp.path('U', 'current.jpg')));
  perform pg_temp.ok('41 owner: can rename within their own folder', r = 'ok', r);

  r := pg_temp.try_sql('U', format(
    'update storage.objects set name = %L where bucket_id = ''avatars'' and name = %L',
    pg_temp.path('V', 'planted.jpg'), pg_temp.path('U', 'current.jpg')));
  perform pg_temp.ok('42 owner: can''t move their photo into someone else''s folder',
    r like '%row-level security%', r);

  r := pg_temp.try_sql('U', format(
    'update storage.objects set name = ''loose.jpg'' where bucket_id = ''avatars'' and name = %L',
    pg_temp.path('U', 'current.jpg')));
  perform pg_temp.ok('43 owner: can''t move their photo to the bucket root', r like '%row-level security%', r);

  r := pg_temp.try_sql('U', format(
    'update storage.objects set bucket_id = ''event-banners'' where bucket_id = ''avatars'' and name = %L',
    pg_temp.path('U', 'current.jpg')));
  perform pg_temp.ok('44 owner: can''t move their photo into another bucket', r like '%row-level security%', r);

  r := pg_temp.try_sql('V', format(
    'update storage.objects set metadata = ''{"size": 2}''::jsonb, owner = %L where bucket_id = ''avatars'' and name = %L',
    pg_temp.uid('V'), pg_temp.path('U', 'current.jpg')));
  perform pg_temp.ok('45 another user: can''t overwrite someone else''s photo', r = '0 rows', r);

  r := pg_temp.try_sql('V', format(
    'update storage.objects set name = %L where bucket_id = ''avatars'' and name = %L',
    pg_temp.path('V', 'stolen.jpg'), pg_temp.path('U', 'current.jpg')));
  perform pg_temp.ok('46 another user: can''t move someone else''s photo into their own folder', r = '0 rows', r);

  r := pg_temp.try_sql('S', format(
    'update storage.objects set metadata = ''{"size": 3}''::jsonb where bucket_id = ''avatars'' and name = %L',
    pg_temp.path('U', 'current.jpg')));
  perform pg_temp.ok('47 super admin: can''t overwrite someone else''s photo', r = '0 rows', r);
end $$;
reset role;

set local role anon;
do $$
declare r text;
begin
  r := pg_temp.try_sql(null, format(
    'update storage.objects set metadata = ''{}''::jsonb where bucket_id = ''avatars'' and name = %L',
    pg_temp.path('U', 'current.jpg')));
  perform pg_temp.ok('48 anon: can''t overwrite a photo', r = '0 rows' or r like '%permission denied%', r);
end $$;
reset role;

-- ------------------------------------------------ 5. remove (DELETE)
set local storage.allow_delete_query = 'true';

set local role authenticated;
do $$
declare r text;
begin
  r := pg_temp.try_sql('V', format('delete from storage.objects where bucket_id = ''avatars'' and name = %L',
    pg_temp.path('U', 'current.jpg')));
  perform pg_temp.ok('50 another user: can''t delete someone else''s photo', r = '0 rows', r);

  r := pg_temp.try_sql('S', format('delete from storage.objects where bucket_id = ''avatars'' and name = %L',
    pg_temp.path('U', 'current.jpg')));
  perform pg_temp.ok('51 super admin: can''t delete someone else''s photo', r = '0 rows', r);
end $$;
reset role;

set local role anon;
do $$
declare r text;
begin
  r := pg_temp.try_sql(null, 'delete from storage.objects where bucket_id = ''avatars''');
  perform pg_temp.ok('52 anon: can''t delete photos', r = '0 rows' or r like '%permission denied%', r);
end $$;
reset role;

do $$
begin
  perform pg_temp.ok('53 after all of that, U''s photo is still there, unchanged and in place',
    (select owner = pg_temp.uid('U') and coalesce(metadata, '{}'::jsonb) = '{}'::jsonb
     from storage.objects where bucket_id = 'avatars' and name = pg_temp.path('U', 'current.jpg')));
end $$;

set local role authenticated;
do $$
declare r text;
begin
  -- keep = true: the delete really happens (inside this test's transaction).
  r := pg_temp.try_sql('U', format('delete from storage.objects where bucket_id = ''avatars'' and name = %L',
    pg_temp.path('U', 'current.jpg')), true);
  perform pg_temp.ok('54 owner: can delete their own photo', r = 'ok', r);
end $$;
reset role;

do $$
begin
  perform pg_temp.ok('55 owner''s delete really removed it',
    not pg_temp.object_exists('avatars', pg_temp.path('U', 'current.jpg')));
end $$;

-- ------------------------------------------------ 6. users.avatar_url
set local role authenticated;
do $$
declare r text;
begin
  r := pg_temp.try_sql('U', format('update public.users set avatar_url = %L where id = %L',
    'http://127.0.0.1:54321/storage/v1/object/public/avatars/' || pg_temp.path('U', 'a.jpg'), pg_temp.uid('U')));
  perform pg_temp.ok('60 owner: can point avatar_url at their own photo', r = 'ok', r);

  r := pg_temp.try_sql('U', format('update public.users set avatar_url = null where id = %L', pg_temp.uid('U')));
  perform pg_temp.ok('61 owner: can clear avatar_url (Remove photo)', r = 'ok', r);

  r := pg_temp.try_sql('U', format('update public.users set avatar_url = %L where id = %L',
    'https://example.com/me.png', pg_temp.uid('U')));
  perform pg_temp.ok('62 CHECK unchanged: an external https URL is still accepted (existing rows stay valid)',
    r = 'ok', r);

  r := pg_temp.try_sql('U', format('update public.users set avatar_url = %L where id = %L',
    'javascript:alert(1)', pg_temp.uid('U')));
  perform pg_temp.ok('63 CHECK unchanged: a non-web URL is still refused', r like '%users_avatar_url_web%', r);

  r := pg_temp.try_sql('V', format('update public.users set avatar_url = null where id = %L', pg_temp.uid('U')));
  perform pg_temp.ok('64 another user: can''t change someone else''s avatar_url', r = '0 rows', r);
end $$;
reset role;

-- ------------------------------------------------ 7. helper and installed shape
set local role authenticated;
do $$
begin
  perform pg_temp.as_user('U');
  perform pg_temp.ok('70 helper: true for the caller''s own one-level path',
    public.is_own_avatar_path(pg_temp.path('U', 'x.jpg')));
  perform pg_temp.ok('71 helper: false for anyone else''s folder, the root, deeper paths or junk',
    not public.is_own_avatar_path(pg_temp.path('V', 'x.jpg'))
    and not public.is_own_avatar_path('x.jpg')
    and not public.is_own_avatar_path(pg_temp.path('U', 'a/b.jpg'))
    and not public.is_own_avatar_path('')
    and public.is_own_avatar_path(null) is not null);
end $$;
reset role;

do $$
begin
  perform pg_temp.ok('72 helper: not security definer, not executable by anon',
    (select not p.prosecdef
            and not has_function_privilege('anon', p.oid, 'EXECUTE')
            and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     from pg_proc p where p.oid = 'public.is_own_avatar_path(text)'::regprocedure));

  perform pg_temp.ok('73 install: avatars policies are select, insert, update, delete, authenticated only',
    (select array_agg(policyname::text || ':' || cmd || ':' || array_to_string(roles, ',') order by policyname)
     from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'avatars_%')
    = array['avatars_delete_own:DELETE:authenticated',
            'avatars_insert_own:INSERT:authenticated',
            'avatars_select_own:SELECT:authenticated',
            'avatars_update_own:UPDATE:authenticated'],
    (select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ', ' order by policyname)
     from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'avatars_%'));

  perform pg_temp.ok('74 install: event-banners policies unchanged',
    (select array_agg(policyname::text order by policyname)
     from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'event_banners_%')
    = array['event_banners_delete_club_manager', 'event_banners_insert_club_manager',
            'event_banners_select_club_manager', 'event_banners_update_club_manager']);

  perform pg_temp.ok('75 install: no storage.objects policy mentions avatars except the four above',
    not exists (select 1 from pg_policies
                where schemaname = 'storage' and tablename = 'objects'
                  and policyname not like 'avatars_%'
                  and (coalesce(qual, '') || coalesce(with_check, '')) like '%avatars%'));

  perform pg_temp.ok('76 install: users avatar_url CHECKs unchanged',
    (select array_agg(conname::text || '=' || pg_get_constraintdef(oid) order by conname)
     from pg_constraint where conrelid = 'public.users'::regclass and conname like 'users_avatar_url_%')
    = array['users_avatar_url_length=CHECK (((avatar_url IS NULL) OR (char_length(avatar_url) <= 500)))',
            'users_avatar_url_web=CHECK (((avatar_url IS NULL) OR (avatar_url ~* ''^https?://''::text)))'],
    (select string_agg(conname || '=' || pg_get_constraintdef(oid), ' | ' order by conname)
     from pg_constraint where conrelid = 'public.users'::regclass and conname like 'users_avatar_url_%'));
end $$;

-- ---------------------------------------------------------------- report
select n, case when pass then 'PASS' else 'FAIL' end as result, name, detail
from t_results order by n;

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed
from t_results;

rollback;
