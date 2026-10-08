-- Role tests for 20260829000001_registration_tickets.sql.
-- Runs entirely inside one transaction and ends in ROLLBACK: nothing persists.
--
-- Actors:  A = student, B = other student, M = club manager (admin of the
--          event's club), S = super_admin.
-- A user is simulated with SET LOCAL ROLE authenticated + a request.jwt.claims
-- `sub`, which is what auth.uid() reads.

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

-- ---------------------------------------------------------------- setup (owner)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local', '{"name":"Student A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local', '{"name":"Student B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'm@test.local', '{"name":"Manager M"}'),
  ('00000000-0000-0000-0000-00000000000d', 's@test.local', '{"name":"Super S"}');

-- Same bootstrap as README: the escalation trigger blocks role changes unless
-- the caller is already a super_admin, so promote with triggers bypassed.
set local session_replication_role = replica;
update public.users set role = 'super_admin' where id = '00000000-0000-0000-0000-00000000000d';
set local session_replication_role = origin;

insert into public.clubs (id, name, slug, verified, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', 'Test Club', 'test-club', true,
   '00000000-0000-0000-0000-00000000000c');  -- handle_new_club makes M an approved admin

insert into public.events (id, club_id, title, slug, venue, start_at, end_at, status, created_by) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1',
   'Test Event', 'test-event', 'Main Auditorium', now() + interval '2 days',
   now() + interval '2 days 3 hours', 'published', '00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1',
   'Second Event', 'second-event', 'OAT', now() + interval '5 days',
   now() + interval '5 days 2 hours', 'published', '00000000-0000-0000-0000-00000000000c');

-- ---------------------------------------------------------------- 1. issuance
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare rid uuid;
begin
  insert into public.event_registrations (event_id, user_id)
  values ('00000000-0000-0000-0000-0000000000e1', auth.uid())
  returning id into rid;
  insert into t_ctx values ('a_reg', rid::text);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
declare rid uuid;
begin
  insert into public.event_registrations (event_id, user_id)
  values ('00000000-0000-0000-0000-0000000000e1', auth.uid())
  returning id into rid;
  insert into t_ctx values ('b_reg', rid::text);
end $$;
reset role;

do $$
declare tok text; tok_b text; rid text := pg_temp.ctx('a_reg');
begin
  select token into tok from public.registration_tickets where registration_id = rid::uuid;
  select token into tok_b from public.registration_tickets where registration_id = pg_temp.ctx('b_reg')::uuid;
  insert into t_ctx values ('a_tok', tok), ('b_tok', tok_b);
  perform pg_temp.ok('01 issuance: student registration gets a ticket row', tok is not null, coalesce(tok, 'no row'));
  perform pg_temp.ok('02 issuance: token is 32 uppercase hex chars (128 bits)', tok ~ '^[0-9A-F]{32}$', tok);
  perform pg_temp.ok('03 issuance: token not derived from registration id',
    tok <> upper(replace(rid, '-', '')) and position(lower(tok) in replace(rid, '-', '')) = 0, rid);
  perform pg_temp.ok('04 issuance: two registrations get different tokens', tok <> tok_b, tok || ' vs ' || tok_b);
end $$;

-- ---------------------------------------------------------------- 2. own-token access (A)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare tok text; n int;
begin
  select token into tok from public.registration_tickets where registration_id = pg_temp.ctx('a_reg')::uuid;
  select count(*) into n from public.registration_tickets;
  perform pg_temp.ok('05 own access: student reads own token', tok = pg_temp.ctx('a_tok'), coalesce(tok, 'null'));
  perform pg_temp.ok('06 own access: student sees only own ticket rows', n = 1, n || ' rows visible');

  begin
    insert into public.registration_tickets (registration_id, token)
    values (pg_temp.ctx('a_reg')::uuid, repeat('A', 32));
    perform pg_temp.ok('07 student cannot INSERT a ticket', false, 'insert succeeded');
  exception when insufficient_privilege then
    perform pg_temp.ok('07 student cannot INSERT a ticket', true, sqlerrm);
  when others then
    perform pg_temp.ok('07 student cannot INSERT a ticket', false, sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.registration_tickets set token = repeat('B', 32)
    where registration_id = pg_temp.ctx('a_reg')::uuid;
    perform pg_temp.ok('08 student cannot UPDATE own token', false, 'update succeeded');
  exception when insufficient_privilege then
    perform pg_temp.ok('08 student cannot UPDATE own token', true, sqlerrm);
  when others then
    perform pg_temp.ok('08 student cannot UPDATE own token', false, sqlstate || ' ' || sqlerrm);
  end;

  begin
    delete from public.registration_tickets where registration_id = pg_temp.ctx('a_reg')::uuid;
    perform pg_temp.ok('09 student cannot DELETE own ticket', false, 'delete succeeded');
  exception when insufficient_privilege then
    perform pg_temp.ok('09 student cannot DELETE own ticket', true, sqlerrm);
  when others then
    perform pg_temp.ok('09 student cannot DELETE own ticket', false, sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------- 3. other user (B)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
declare n_a int; n int;
begin
  select count(*) into n_a from public.registration_tickets where registration_id = pg_temp.ctx('a_reg')::uuid;
  select count(*) into n from public.registration_tickets;
  perform pg_temp.ok('10 other student cannot read A''s token', n_a = 0, n_a || ' rows');
  perform pg_temp.ok('11 other student sees only their own ticket', n = 1, n || ' rows visible');
end $$;

-- ---------------------------------------------------------------- 4. manager (M)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
do $$
declare n_t int; n_r int;
begin
  select count(*) into n_t from public.registration_tickets;
  select count(*) into n_r from public.event_registrations;
  perform pg_temp.ok('12 manager cannot read any tokens', n_t = 0, n_t || ' ticket rows visible');
  perform pg_temp.ok('13 manager still sees registrations (policy unchanged)', n_r = 2, n_r || ' registrations visible');

  begin
    update public.registration_tickets set token = repeat('C', 32);
    perform pg_temp.ok('14 manager cannot UPDATE tokens', false, 'update succeeded');
  exception when insufficient_privilege then
    perform pg_temp.ok('14 manager cannot UPDATE tokens', true, sqlerrm);
  when others then
    perform pg_temp.ok('14 manager cannot UPDATE tokens', false, sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.event_registrations set ticket_code = 'FORGED000000'
    where id = pg_temp.ctx('a_reg')::uuid;
    perform pg_temp.ok('15 manager cannot change ticket_code', false, 'update succeeded');
  exception when raise_exception then
    perform pg_temp.ok('15 manager cannot change ticket_code', sqlerrm = 'ticket_code is immutable', sqlerrm);
  when others then
    perform pg_temp.ok('15 manager cannot change ticket_code', false, sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- Regression: the door path (manager sets checked_in_at) still works.
do $$
declare n int;
begin
  update public.event_registrations set checked_in_at = now()
  where id = pg_temp.ctx('a_reg')::uuid;
  get diagnostics n = row_count;
  perform pg_temp.ok('16 manager can still set checked_in_at (no regression)', n = 1, n || ' rows updated');
end $$;

-- ---------------------------------------------------------------- 5. super_admin (S)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
do $$
declare n_t int; n_r int;
begin
  select count(*) into n_t from public.registration_tickets;
  select count(*) into n_r from public.event_registrations;
  perform pg_temp.ok('17 super_admin cannot read any tokens', n_t = 0, n_t || ' ticket rows visible');
  perform pg_temp.ok('18 super_admin still sees registrations (policy unchanged)', n_r = 2, n_r || ' registrations visible');
end $$;
reset role;

-- ---------------------------------------------------------------- 6. immutability for the owner role
do $$
begin
  begin
    update public.registration_tickets set token = repeat('D', 32)
    where registration_id = pg_temp.ctx('a_reg')::uuid;
    perform pg_temp.ok('19 owner role cannot change a token (trigger)', false, 'update succeeded');
  exception when raise_exception then
    perform pg_temp.ok('19 owner role cannot change a token (trigger)', sqlerrm = 'ticket tokens are immutable', sqlerrm);
  end;

  begin
    update public.registration_tickets set registration_id = pg_temp.ctx('b_reg')::uuid
    where registration_id = pg_temp.ctx('a_reg')::uuid;
    perform pg_temp.ok('20 owner role cannot move a ticket to another registration', false, 'update succeeded');
  exception when raise_exception then
    perform pg_temp.ok('20 owner role cannot move a ticket to another registration', sqlerrm = 'ticket tokens are immutable', sqlerrm);
  when others then
    perform pg_temp.ok('20 owner role cannot move a ticket to another registration', false, sqlstate || ' ' || sqlerrm);
  end;

  begin
    update public.event_registrations set ticket_code = 'FORGED000000'
    where id = pg_temp.ctx('a_reg')::uuid;
    perform pg_temp.ok('21 owner role cannot change ticket_code (trigger)', false, 'update succeeded');
  exception when raise_exception then
    perform pg_temp.ok('21 owner role cannot change ticket_code (trigger)', sqlerrm = 'ticket_code is immutable', sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------- 7. backfill
-- Recreate the pre-migration situation: a registration with no ticket.
-- session_replication_role = replica skips user triggers, so the issue
-- trigger (and generate_ticket_code) don't run; ticket_code is supplied.
set local session_replication_role = replica;
insert into public.event_registrations (id, event_id, user_id, ticket_code) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e2',
   '00000000-0000-0000-0000-00000000000a', 'LEGACY000001');
set local session_replication_role = origin;

do $$
declare before_n int; tok text; a_tok_after text;
begin
  select count(*) into before_n from public.registration_tickets
  where registration_id = '00000000-0000-0000-0000-0000000000f1';

  -- exactly the backfill statement from the migration
  insert into public.registration_tickets (registration_id)
  select id from public.event_registrations
  on conflict (registration_id) do nothing;

  select token into tok from public.registration_tickets
  where registration_id = '00000000-0000-0000-0000-0000000000f1';
  select token into a_tok_after from public.registration_tickets
  where registration_id = pg_temp.ctx('a_reg')::uuid;

  perform pg_temp.ok('22 backfill: legacy registration had no ticket before', before_n = 0, before_n || ' rows');
  perform pg_temp.ok('23 backfill: legacy registration gets a valid token', tok ~ '^[0-9A-F]{32}$', coalesce(tok, 'no row'));
  perform pg_temp.ok('24 backfill: existing tokens untouched (idempotent)', a_tok_after = pg_temp.ctx('a_tok'), a_tok_after);
end $$;

-- ---------------------------------------------------------------- 8. get_my_registrations()
do $$
declare res text; cfg text[]; secdef boolean; nargs int;
begin
  select pg_get_function_result(p.oid), p.proconfig, p.prosecdef, p.pronargs
    into res, cfg, secdef, nargs
  from pg_proc p where p.oid = 'public.get_my_registrations'::regproc;
  perform pg_temp.ok('25 rpc: takes no parameters (user = auth.uid() only)', nargs = 0, nargs || ' args');
  perform pg_temp.ok('26 rpc: security definer with pinned search_path', secdef and cfg @> array['search_path=""'], array_to_string(cfg, ','));
  perform pg_temp.ok('27 rpc: result has no token column', res not ilike '%token%', res);
  perform pg_temp.ok('28 rpc: EXECUTE revoked from anon', not has_function_privilege('anon', 'public.get_my_registrations()', 'execute'), '');
  perform pg_temp.ok('29 rpc: EXECUTE granted to authenticated', has_function_privilege('authenticated', 'public.get_my_registrations()', 'execute'), '');
end $$;

-- M cancels the first event, to check registrants still see it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
update public.events set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000e1';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$
declare n int; n_cancelled int; n_events_direct int; leaked int;
begin
  select count(*) into n from public.get_my_registrations();
  select count(*) into n_cancelled from public.get_my_registrations()
  where event_id = '00000000-0000-0000-0000-0000000000e1' and event_status = 'cancelled';
  select count(*) into n_events_direct from public.events where id = '00000000-0000-0000-0000-0000000000e1';
  select count(*) into leaked from public.get_my_registrations() r
  where row_to_json(r)::text like '%' || pg_temp.ctx('a_tok') || '%';
  perform pg_temp.ok('30 rpc: student gets their own registrations', n = 2, n || ' rows');
  perform pg_temp.ok('31 rpc: cancelled event still listed for its registrant', n_cancelled = 1, n_cancelled || ' rows');
  perform pg_temp.ok('32 rpc needed: events RLS hides the cancelled event from a plain select', n_events_direct = 0, n_events_direct || ' rows');
  perform pg_temp.ok('33 rpc: token value never appears in its output', leaked = 0, leaked || ' rows leaking');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
declare n int; foreign_rows int;
begin
  select count(*) into n from public.get_my_registrations();
  select count(*) into foreign_rows from public.get_my_registrations()
  where registration_id <> pg_temp.ctx('b_reg')::uuid;
  perform pg_temp.ok('34 rpc: other student sees only their own registration', n = 1 and foreign_rows = 0, n || ' rows');
end $$;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.get_my_registrations();
  perform pg_temp.ok('35 rpc: authenticated with no user id gets nothing', n = 0, n || ' rows');
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform * from public.get_my_registrations();
    perform pg_temp.ok('36 rpc: anon is denied', false, 'call succeeded');
  exception when insufficient_privilege then
    perform pg_temp.ok('36 rpc: anon is denied', true, sqlerrm);
  end;

  begin
    perform * from public.registration_tickets;
    perform pg_temp.ok('37 anon cannot read registration_tickets', false, 'select succeeded');
  exception when insufficient_privilege then
    perform pg_temp.ok('37 anon cannot read registration_tickets', true, sqlerrm);
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- 9. cascade
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
delete from public.event_registrations where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.registration_tickets
  where registration_id = '00000000-0000-0000-0000-0000000000f1';
  perform pg_temp.ok('38 cancelling a registration removes its ticket (cascade)', n = 0, n || ' rows left');
end $$;

-- ---------------------------------------------------------------- report
select n, case when pass then 'PASS' else 'FAIL' end as result, name, detail
from t_results order by n;

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed
from t_results;

rollback;
