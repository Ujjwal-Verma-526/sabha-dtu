-- Run in the live SQL editor BEFORE pasting
-- supabase/live/20260901000001_profile_field_checks.sql.
-- Read-only: one SELECT, changes nothing. Safe to run any number of times.
--
-- The first row (summary) says whether the migration can be pasted now.
-- Rows below it:
--   check      ok = true means fine
--   violation  a profile the new CHECKs would reject. Fix it first (the
--              owner can edit it on /profile, or set the field to null /
--              shorten it in the Table editor), then run this again.
--
-- The rules are written out inline because the constraints don't exist
-- until the migration runs. They must match
-- supabase/migrations/20260901000001_profile_field_checks.sql:
--   name not blank and <= 100 characters, roll_number <= 30,
--   branch <= 100, avatar_url <= 500 and starting with http:// or https://.
with violations as (
  select u.id, u.email, 'users_name_not_blank' as rule,
         'name is blank' as detail
  from public.users u where btrim(u.name) = ''
  union all
  select u.id, u.email, 'users_name_length',
         'name is ' || char_length(u.name) || ' characters (max 100)'
  from public.users u where char_length(u.name) > 100
  union all
  select u.id, u.email, 'users_roll_number_length',
         'roll_number is ' || char_length(u.roll_number) || ' characters (max 30)'
  from public.users u where char_length(u.roll_number) > 30
  union all
  select u.id, u.email, 'users_branch_length',
         'branch is ' || char_length(u.branch) || ' characters (max 100)'
  from public.users u where char_length(u.branch) > 100
  union all
  select u.id, u.email, 'users_avatar_url_length',
         'avatar_url is ' || char_length(u.avatar_url) || ' characters (max 500)'
  from public.users u where char_length(u.avatar_url) > 500
  union all
  -- quote_literal shows hidden characters' position without rendering them
  -- as a link; only the first 60 characters are shown.
  select u.id, u.email, 'users_avatar_url_web',
         'avatar_url does not start with http:// or https://: '
           || quote_literal(left(u.avatar_url, 60))
  from public.users u where u.avatar_url !~* '^https?://'
),
already_applied as (
  select exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname in ('users_name_not_blank', 'users_name_length',
                      'users_roll_number_length', 'users_branch_length',
                      'users_avatar_url_length', 'users_avatar_url_web')
  ) as yes
),
rows(sort, kind, ok, item, detail) as (
  select 0, 'summary',
         not (select yes from already_applied)
           and not exists (select 1 from violations),
         'ready to paste supabase/live/20260901000001_profile_field_checks.sql',
         'true only if every check below is ok'
  union all
  select 1, 'check',
         not (select yes from already_applied),
         '20260901000001 is not applied yet',
         'false means it is already on live; run the verify query instead'
  union all
  select 1, 'check',
         not exists (select 1 from violations),
         'no profile breaks the new checks',
         (select count(*) from violations) || ' violation(s) across '
           || (select count(distinct id) from violations) || ' profile(s), out of '
           || (select count(*) from public.users) || ' profiles in total'
  union all
  select 2, 'violation', false,
         v.rule || ': ' || v.email,
         'id ' || v.id || '; ' || v.detail
  from violations v
)
select kind, ok, item, detail
from rows
order by sort, ok, item;
