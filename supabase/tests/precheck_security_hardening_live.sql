-- Run in the live SQL editor BEFORE pasting
-- supabase/live/20260902000001_security_hardening.sql.
-- Read-only: one SELECT, changes nothing. Safe to run any number of times.
--
-- The first row (summary) says whether the migration can be pasted now.
-- Rows below it:
--   check      ok = true means fine
--   violation  a club or event the new CHECKs would reject. Fix it first
--              (clear the field, or correct it in the Table editor), then
--              run this again. Blocks the paste.
--   warning    a club with no approved admin today. Doesn't block the paste,
--              but once the migration is in, only a super admin can add an
--              admin (coordinators no longer can, and there is no screen for
--              it). Easiest to fix now, before pasting, while a plain insert
--              still works:
--                insert into public.club_members (club_id, user_id, role, status)
--                values ('<club id>', '<user id>', 'admin', 'approved')
--                on conflict (club_id, user_id) do update set role = 'admin', status = 'approved';
--
-- The rules are written out inline because the constraints don't exist
-- until the migration runs. They must match
-- supabase/migrations/20260902000001_security_hardening.sql:
--   instagram_handle  null or ^@?[A-Za-z0-9._]{1,30}$
--   logo_url,         null, or <= 500 characters starting with https://
--   banner_url        (any case), or the local stack's
--                     http://127.0.0.1|localhost:54321/storage/v1/object/public/
with url_rule(pattern) as (
  select '^(https://|http://(127\.0\.0\.1|localhost):54321/storage/v1/object/public/)'::text
),
violations as (
  -- quote_literal shows hidden characters without rendering a link; only the
  -- first 60 characters are shown.
  select 'club' as kind, c.id, c.slug, 'clubs_instagram_handle_format' as rule,
         'instagram_handle is ' || quote_literal(left(c.instagram_handle, 60)) as detail
  from public.clubs c
  where c.instagram_handle !~ '^@?[A-Za-z0-9._]{1,30}$'
  union all
  select 'club', c.id, c.slug, 'clubs_logo_url_length',
         'logo_url is ' || char_length(c.logo_url) || ' characters (max 500)'
  from public.clubs c where char_length(c.logo_url) > 500
  union all
  select 'club', c.id, c.slug, 'clubs_logo_url_https',
         'logo_url does not start with https://: ' || quote_literal(left(c.logo_url, 60))
  from public.clubs c, url_rule r where c.logo_url !~* r.pattern
  union all
  select 'event', e.id, e.slug, 'events_banner_url_length',
         'banner_url is ' || char_length(e.banner_url) || ' characters (max 500)'
  from public.events e where char_length(e.banner_url) > 500
  union all
  select 'event', e.id, e.slug, 'events_banner_url_https',
         'banner_url does not start with https://: ' || quote_literal(left(e.banner_url, 60))
  from public.events e, url_rule r where e.banner_url !~* r.pattern
),
no_admin as (
  select c.id, c.slug, c.name, c.verified
  from public.clubs c
  where not exists (
    select 1 from public.club_members m
    where m.club_id = c.id and m.role = 'admin' and m.status = 'approved'
  )
),
already_applied as (
  select exists (
           select 1 from pg_constraint
           where conname in ('clubs_instagram_handle_format', 'clubs_logo_url_length',
                             'clubs_logo_url_https', 'events_banner_url_length',
                             'events_banner_url_https')
             and conrelid in ('public.clubs'::regclass, 'public.events'::regclass))
         or exists (
           select 1 from pg_trigger
           where tgrelid = 'public.club_members'::regclass
             and tgname = 'club_members_guard_admin_changes')
         or exists (
           select 1 from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname = 'event_banners_select_club_manager') as yes
),
prerequisites as (
  select to_regprocedure('public.is_super_admin(uuid)') is not null
     and to_regprocedure('public.is_club_manager(uuid, uuid)') is not null
     and to_regprocedure('public.storage_folder_club_id(text)') is not null
     and to_regprocedure('public.handle_new_club()') is not null
     and exists (select 1 from storage.buckets where id = 'event-banners')
     and exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'event_banners_select_public') as ok
),
rows(sort, kind, ok, item, detail) as (
  select 0, 'summary',
         not (select yes from already_applied)
           and (select ok from prerequisites)
           and not exists (select 1 from violations),
         'ready to paste supabase/live/20260902000001_security_hardening.sql',
         'true only if every check below is ok; '
           || (select count(*) from no_admin) || ' club(s) without an approved admin (warnings, not blocking)'
  union all
  select 1, 'check',
         not (select yes from already_applied),
         '20260902000001 is not applied yet',
         'false means it is already on live; run the verify query instead'
  union all
  select 1, 'check',
         (select ok from prerequisites),
         'helpers, event-banners bucket and its public SELECT policy exist',
         'false means an earlier migration (20260825000003, 20260827000001) is missing'
  union all
  select 1, 'check',
         not exists (select 1 from violations),
         'no club or event breaks the new checks',
         (select count(*) from violations) || ' violation(s), out of '
           || (select count(*) from public.clubs) || ' clubs and '
           || (select count(*) from public.events) || ' events'
  union all
  select 2, 'violation', false,
         v.rule || ': ' || v.kind || ' ' || v.slug,
         'id ' || v.id || '; ' || v.detail
  from violations v
  union all
  select 3, 'warning', false,
         'no approved admin: club ' || n.slug,
         'id ' || n.id || '; ' || quote_literal(n.name)
           || case when n.verified then ', verified' else ', unverified' end
  from no_admin n
)
select kind, ok, item, detail
from rows
order by sort, ok, item;
