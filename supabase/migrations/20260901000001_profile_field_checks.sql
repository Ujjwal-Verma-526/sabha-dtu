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
