-- PASTE THIS WHOLE FILE into the live Supabase SQL editor and run it once.
-- It is supabase/migrations/20260901000001_profile_field_checks.sql
-- wrapped in one transaction: if any statement fails, nothing is applied.
--
-- Order:
--   1. supabase/tests/precheck_profile_field_checks_live.sql
--      (read-only; its first row, the summary, must say ok = true)
--   2. this file
--   3. supabase/tests/verify_profile_field_checks_live.sql
--      (read-only; every row ok = true)
--
-- Requires only the original users table and handle_new_auth_user
-- (20260825000001/2). It doesn't depend on door check-in or
-- registration-closes-at-start, so it can go before or after them. The
-- checks below stop with a clear message, before anything changes, if this
-- migration is already applied or if any existing profile would break a new
-- CHECK.
--
-- What it changes: public.users gets CHECKs on name, roll_number, branch
-- and avatar_url, and handle_new_auth_user trims and caps the name it copies
-- at sign-up so the CHECKs can never make a sign-up fail. No policy changes.

begin;

-- ---------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------

do $$
declare
  v_count integer;
  v_examples text;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname in ('users_name_not_blank', 'users_name_length',
                      'users_roll_number_length', 'users_branch_length',
                      'users_avatar_url_length', 'users_avatar_url_web')
  ) then
    raise exception '20260901000001_profile_field_checks is already applied (a users_*_length / users_name_not_blank / users_avatar_url_web constraint exists). Nothing was changed. Run supabase/tests/verify_profile_field_checks_live.sql instead.';
  end if;

  if to_regprocedure('public.handle_new_auth_user()') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid = 'auth.users'::regclass
         and tgname = 'on_auth_user_created'
         and tgfoid = 'public.handle_new_auth_user()'::regprocedure
     ) then
    raise exception 'handle_new_auth_user or its on_auth_user_created trigger is missing; apply 20260825000002_auth_profile_sync first. Nothing was changed.';
  end if;

  -- Same rules as the CHECKs below, written out because they don't exist yet.
  select count(*),
         string_agg(rule || ' ' || id, ', ' order by id, rule) filter (where rn <= 5)
    into v_count, v_examples
  from (
    select v.id, v.rule, row_number() over (order by v.id, v.rule) as rn
    from (
      select u.id, 'users_name_not_blank' as rule from public.users u where btrim(u.name) = ''
      union all
      select u.id, 'users_name_length' from public.users u where char_length(u.name) > 100
      union all
      select u.id, 'users_roll_number_length' from public.users u where char_length(u.roll_number) > 30
      union all
      select u.id, 'users_branch_length' from public.users u where char_length(u.branch) > 100
      union all
      select u.id, 'users_avatar_url_length' from public.users u where char_length(u.avatar_url) > 500
      union all
      select u.id, 'users_avatar_url_web' from public.users u where u.avatar_url !~* '^https?://'
    ) v
  ) numbered;

  if v_count > 0 then
    if v_count > 5 then
      v_examples := v_examples || ', and ' || (v_count - 5) || ' more';
    end if;
    raise exception '% profile value(s) would break the new CHECKs: %. Nothing was changed. Run supabase/tests/precheck_profile_field_checks_live.sql for the full list, fix those profiles, then paste this file again.',
      v_count, v_examples;
  end if;
end;
$$;

-- Profile field limits, enforced by the database.
--
-- The /profile form (src/lib/profile-form.ts) already refuses a non-web
-- avatar_url and over-long text, but the users_update_own policy lets a
-- signed-in user PATCH their own row straight through the API, skipping the
-- form. A stored `javascript:` or `data:` avatar_url becomes XSS the day it
-- is rendered, and unbounded text fields let anyone store megabytes. These
-- CHECKs close that for every writer, including super_admins.
--
-- The limits live HERE. src/lib/profile-form.ts mirrors them for the form's
-- inputs and friendly field errors, with a comment pointing back to this
-- file. Change both together.
--
--   name         required (not blank), at most 100 characters
--   roll_number  null or at most 30 characters
--   branch       null or at most 100 characters
--   avatar_url   null, or at most 500 characters starting with http:// or
--                https:// (any letter case)
--
-- Lengths are char_length (characters, not bytes), so a Hindi or other
-- non-Latin name gets the same 100 characters. JavaScript's .length counts
-- UTF-16 units, which is never fewer, so anything the form accepts fits.
--
-- No policy changes. Who can edit which row is exactly as before.

-- ---------------------------------------------------------------------
-- 1. Sign-up can never trip the new checks
-- ---------------------------------------------------------------------
--
-- handle_new_auth_user (20260825000002) creates the public.users row when
-- auth.users gets a new row: magic link and Google sign-up both go through
-- it. It runs on INSERT only, so a later sign-in never touches public.users.
-- It copies email and name; it never copied avatar_url (Google's picture
-- URL included), and still doesn't, so no metadata avatar can break it.
--
-- Name is the one copied field a check could refuse. Each candidate is
-- trimmed and skipped if blank, then the result is cut to 100 characters.
-- 'New user' is the last resort when there is no name and no usable email
-- local part, so the not-blank check always holds. The user can change it
-- on /profile.
--
-- create or replace keeps the owner (postgres), so it still bypasses RLS,
-- and the on_auth_user_created trigger already points at this name.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(btrim(split_part(new.email, '@', 1)), ''),
        'New user'
      ),
      100
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. The checks
-- ---------------------------------------------------------------------

alter table public.users
  add constraint users_name_not_blank check (btrim(name) <> ''),
  add constraint users_name_length check (char_length(name) <= 100),
  add constraint users_roll_number_length check (
    roll_number is null or char_length(roll_number) <= 30
  ),
  add constraint users_branch_length check (
    branch is null or char_length(branch) <= 100
  ),
  add constraint users_avatar_url_length check (
    avatar_url is null or char_length(avatar_url) <= 500
  ),
  add constraint users_avatar_url_web check (
    avatar_url is null or avatar_url ~* '^https?://'
  );

commit;
