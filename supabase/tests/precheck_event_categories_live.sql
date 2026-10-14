-- Run in the live SQL editor BEFORE pasting
-- supabase/live/20260904000001_event_categories.sql.
-- Read-only: one SELECT, changes nothing. Safe to run any number of times.
--
-- The migration adds events.category and fills it in from the club's
-- category when that is one of technical, cultural, social, entrepreneurship
-- (any case), otherwise 'other'. The first row, the summary, says whether the
-- file can be pasted now:
--   ok = true   the previous migration is applied, this one isn't, and there
--               is no hand-added events.category column in the way.
-- Rows below it:
--   previous / not_applied / no_column / updated_at_trigger   the conditions
--   backfill        how many events will get each category
--   falls_back      one row per event that will get 'other' because its
--                   club's category is empty or not one of the five names
--                   (ok = true: that's what its poster shows today). Change
--                   any of them in the event form after the app deploy.
--   invalid_value   only if a hand-added events.category column exists: one
--                   row per event whose value would break the new CHECK
--                   (ok = false). The paste file stops naming these.
-- The column is read through to_jsonb so this runs whether or not it exists.
with state as (
  select
    coalesce((select position('sabha:creator-cleared-by-fk' in p.prosrc) > 0
              from pg_proc p
              where p.oid = to_regprocedure('public.prevent_club_protected_field_changes()')),
             false) as previous,
    exists (select 1 from pg_constraint
            where conrelid = 'public.events'::regclass
              and conname = 'events_category_valid') as applied,
    exists (select 1 from pg_attribute
            where attrelid = 'public.events'::regclass
              and attname = 'category' and not attisdropped) as has_column,
    exists (select 1 from pg_trigger
            where tgrelid = 'public.events'::regclass
              and tgname = 'events_set_updated_at' and not tgisinternal) as has_trigger
),
ev as (
  select e.slug, e.status::text as status, c.name as club_name, c.category as club_category,
         to_jsonb(e) ->> 'category' as current_value,
         case when lower(regexp_replace(c.category, '^\s+|\s+$', '', 'g'))
                   in ('technical', 'cultural', 'social', 'entrepreneurship')
              then lower(regexp_replace(c.category, '^\s+|\s+$', '', 'g'))
              else 'other' end as will_get,
         lower(regexp_replace(c.category, '^\s+|\s+$', '', 'g'))
           in ('technical', 'cultural', 'social', 'entrepreneurship', 'other') as club_matches
  from public.events e
  join public.clubs c on c.id = e.club_id
),
invalid as (
  select ev.* from ev, state
  where state.has_column and not state.applied
    and (current_value is null
         or current_value not in ('technical', 'cultural', 'social', 'entrepreneurship', 'other'))
)
select 0 as sort, 'summary' as check_name,
       (previous and not applied and not has_column and has_trigger) as ok,
       case when not previous then '20260903000001_club_creator_delete is not applied yet: apply it first.'
            when applied then '20260904000001 is already applied: nothing to do.'
            when has_column then 'events.category already exists without this migration'
                 || case when (select count(*) from invalid) > 0
                         then ': ' || (select count(*) from invalid) || ' event(s) listed below as invalid_value would break the CHECK. Ask before applying.'
                         else '. Ask before applying.' end
            when not has_trigger then 'events_set_updated_at is missing: the schema is not what the migration expects.'
            else 'ready to paste: ' || (select count(*) from ev) || ' event(s) will be backfilled, '
                 || (select count(*) from ev where not coalesce(club_matches, false)) || ' of them fall back to other (listed below)' end as detail
from state
union all
select 1, 'previous', previous, '20260903000001 applied' from state
union all
select 2, 'not_applied', not applied, 'events_category_valid does not exist yet' from state
union all
select 3, 'no_column', not has_column, 'events.category does not exist yet' from state
union all
select 4, 'updated_at_trigger', has_trigger, 'events_set_updated_at exists (switched off during the backfill)' from state
union all
select 5, 'backfill', true,
       coalesce((select string_agg(n || ' ' || will_get, ', ' order by will_get)
                 from (select will_get, count(*) as n from ev group by will_get) g), 'no events')
from state where not applied
union all
select 10, 'falls_back', true,
       format('%s (%s, club %s, club category %s) -> other',
              slug, status, club_name, coalesce(quote_literal(club_category), 'none'))
from ev, state
where not state.applied and not coalesce(ev.club_matches, false)
union all
select 20, 'invalid_value', false,
       format('%s (%s, club %s): category %s', slug, status, club_name,
              coalesce(quote_literal(current_value), 'null'))
from invalid
order by sort, detail;
