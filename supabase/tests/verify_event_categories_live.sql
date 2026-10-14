-- Run in the live SQL editor AFTER pasting
-- supabase/live/20260904000001_event_categories.sql.
-- Read-only: one SELECT. Every row should say ok = true; the last ones
-- (sort 20+) are informational counts per category.
--
-- The refusals can't be exercised without writing, so this checks the
-- installed definition and the data; the behaviour is covered by
-- supabase/tests/event_categories_roles.sql on the local stack.
with col as (
  select a.attnotnull, format_type(a.atttypid, a.atttypmod) as type,
         pg_get_expr(d.adbin, d.adrelid) as default_expr
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.events'::regclass
    and a.attname = 'category' and not a.attisdropped
),
con as (
  select c.convalidated, pg_get_constraintdef(c.oid) as def
  from pg_constraint c
  where c.conrelid = 'public.events'::regclass and c.conname = 'events_category_valid'
)
select 1 as sort, 'events.category is text, not null, default ''other''' as check_name,
       coalesce((select type = 'text' and attnotnull and default_expr = '''other''::text' from col), false) as ok
union all
select 2, 'events_category_valid exists, is validated and allows exactly the five keys',
       coalesce((select convalidated
                        and def like '%''technical''%' and def like '%''cultural''%'
                        and def like '%''social''%' and def like '%''entrepreneurship''%'
                        and def like '%''other''%'
                        and (length(def) - length(replace(def, '::text', ''))) / length('::text') = 5
                 from con), false)
union all
select 3, 'every event has one of the five categories',
       not exists (select 1 from public.events
                   where category not in ('technical', 'cultural', 'social', 'entrepreneurship', 'other'))
union all
select 4, 'events_set_updated_at is enabled again',
       exists (select 1 from pg_trigger
               where tgrelid = 'public.events'::regclass
                 and tgname = 'events_set_updated_at' and tgenabled = 'O')
union all
select 5, 'RLS still enabled on events, with its four policies',
       (select relrowsecurity from pg_class where oid = 'public.events'::regclass)
       and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'events') = 4
union all
select 6, 'anon and authenticated can read the column; authenticated can write it (RLS decides which rows)',
       has_column_privilege('anon', 'public.events', 'category', 'SELECT')
       and has_column_privilege('authenticated', 'public.events', 'category', 'SELECT')
       and has_column_privilege('authenticated', 'public.events', 'category', 'INSERT')
       and has_column_privilege('authenticated', 'public.events', 'category', 'UPDATE')
union all
select 20 + row_number() over (order by category),
       format('count: %s = %s', category, n), true
from (select category, count(*) as n from public.events group by category) g
order by sort;
