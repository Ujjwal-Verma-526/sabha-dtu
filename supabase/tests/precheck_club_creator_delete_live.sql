-- Run in the live SQL editor BEFORE pasting
-- supabase/live/20260903000001_club_creator_delete.sql.
-- Read-only: one SELECT, changes nothing. Safe to run any number of times.
--
-- This migration adds no constraint, so no existing row can break it. The
-- summary row (first) says whether it can be pasted now:
--   ok = true   the previous migration is applied and this one isn't yet.
-- Rows below it are informational:
--   previous     20260902000001 is applied (club admin guard exists)
--   not_applied  the guard still has its old body
--   creators     how many clubs have a created_by (the rows this affects
--                when their creator is deleted)
with state as (
  select
    exists (select 1 from pg_trigger
            where tgrelid = 'public.club_members'::regclass
              and tgname = 'club_members_guard_admin_changes') as previous,
    coalesce((select position('sabha:creator-cleared-by-fk' in p.prosrc) > 0
              from pg_proc p
              where p.oid = to_regprocedure('public.prevent_club_protected_field_changes()')),
             false) as applied
)
select 0 as sort, 'summary' as check_name,
       (previous and not applied) as ok,
       case when not previous then '20260902000001_security_hardening is not applied yet: apply it first.'
            when applied then '20260903000001 is already applied: nothing to do.'
            else 'ready to paste' end as detail
from state
union all
select 1, 'previous', previous, '20260902000001 applied' from state
union all
select 2, 'not_applied', not applied, 'guard still has the old body' from state
union all
select 3, 'creators', true,
       (select count(*) from public.clubs where created_by is not null) || ' clubs have a creator'
order by sort;
