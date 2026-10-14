-- PASTE THIS WHOLE FILE into the live Supabase SQL editor and run it once.
-- It is supabase/migrations/20260904000001_event_categories.sql wrapped in
-- one transaction: if any statement fails, nothing is applied.
--
-- Order:
--   1. supabase/tests/precheck_event_categories_live.sql
--      (read-only; its first row, the summary, must say ok = true. The rows
--      below it list every event that will get 'other' because its club's
--      category isn't one of the five names.)
--   2. this file
--   3. supabase/tests/verify_event_categories_live.sql
--      (read-only; every row ok = true, the last ones are informational)
--
-- Requires 20260903000001_club_creator_delete. The check below stops with a
-- clear message, before anything changes, if that is missing, if this
-- migration is already applied, or if an events.category column already
-- exists (added by hand), naming any of its rows that would break the new
-- CHECK.
--
-- DEPLOY ORDER: paste this BEFORE deploying the app. The new app reads and
-- writes events.category, so /events, the event page and the event form fail
-- until the column exists. The old app keeps working after the paste (its
-- inserts get the default 'other').

begin;

do $$
declare
  bad text;
  bad_count integer;
begin
  if coalesce((select position('sabha:creator-cleared-by-fk' in p.prosrc) = 0
               from pg_proc p
               where p.oid = to_regprocedure('public.prevent_club_protected_field_changes()')),
              true) then
    raise exception '20260903000001_club_creator_delete is not applied. Apply it first. Nothing was changed.';
  end if;

  if exists (select 1 from pg_constraint
             where conrelid = 'public.events'::regclass
               and conname = 'events_category_valid') then
    raise exception '20260904000001_event_categories is already applied (events_category_valid exists). Nothing was changed. Run supabase/tests/verify_event_categories_live.sql instead.';
  end if;

  if not exists (select 1 from pg_trigger
                 where tgrelid = 'public.events'::regclass
                   and tgname = 'events_set_updated_at' and not tgisinternal) then
    raise exception 'Trigger events_set_updated_at on public.events is missing; the schema is not what this migration expects. Nothing was changed.';
  end if;

  if exists (select 1 from pg_attribute
             where attrelid = 'public.events'::regclass
               and attname = 'category' and not attisdropped) then
    select count(*),
           string_agg(format('%s (%s)', e.slug, coalesce(quote_literal(to_jsonb(e) ->> 'category'), 'null')),
                      ', ' order by e.slug)
      into bad_count, bad
    from public.events e
    where (to_jsonb(e) ->> 'category') is null
       or (to_jsonb(e) ->> 'category') not in ('technical', 'cultural', 'social', 'entrepreneurship', 'other');
    raise exception 'public.events already has a category column that this migration did not add%. This file adds the column itself, so it must not run until that column is sorted out: ask before applying. Nothing was changed.',
      case when bad_count > 0
           then format(', and %s event(s) have a value outside technical, cultural, social, entrepreneurship, other: %s', bad_count, bad)
           else ' (every value in it is valid, but its type, default and NOT NULL are unknown)' end;
  end if;
end $$;

-- Every event gets its own category from a fixed list: technical, cultural,
-- social, entrepreneurship or other (stored as these lowercase keys; the app
-- shows them capitalised, see src/lib/categories.ts). Until now the event
-- colours came from the club's free-text category, which stays free text.
--
-- Existing events are filled in from their club's category when it is one of
-- the five names (any case, surrounding whitespace ignored; the same match
-- the app used for the colours), otherwise 'other', which is what those
-- events already showed. The backfill is not a user edit, so
-- events_set_updated_at is switched off around it and updated_at keeps its
-- value.
--
-- The default 'other' keeps inserts that don't name a category (an app
-- deploy that predates this column) working; the event form requires an
-- explicit choice. RLS is unchanged: managers who can edit an event can set
-- its category, and the column is readable wherever the event is.

alter table public.events
  add column category text not null default 'other';

alter table public.events disable trigger events_set_updated_at;

update public.events e
set category = lower(regexp_replace(c.category, '^\s+|\s+$', '', 'g'))
from public.clubs c
where c.id = e.club_id
  and lower(regexp_replace(c.category, '^\s+|\s+$', '', 'g'))
      in ('technical', 'cultural', 'social', 'entrepreneurship');

alter table public.events enable trigger events_set_updated_at;

alter table public.events
  add constraint events_category_valid
  check (category in ('technical', 'cultural', 'social', 'entrepreneurship', 'other'));

commit;
