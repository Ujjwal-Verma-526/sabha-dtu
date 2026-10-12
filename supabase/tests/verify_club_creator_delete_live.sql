-- Run in the live SQL editor AFTER pasting
-- supabase/live/20260903000001_club_creator_delete.sql.
-- Read-only: one SELECT. Every row should say ok = true.
--
-- The refusals and the allowed SET NULL can't be exercised without writing,
-- so this checks the installed definition; the behaviour is covered by
-- supabase/tests/club_creator_delete_roles.sql on the local stack.
with fn as (
  select p.prosecdef, p.prosrc, p.proconfig
  from pg_proc p
  where p.oid = to_regprocedure('public.prevent_club_protected_field_changes()')
),
trg as (
  select t.tgenabled, t.tgtype, t.tgfoid::regproc::text as fn
  from pg_trigger t
  where t.tgrelid = 'public.clubs'::regclass
    and t.tgname = 'clubs_prevent_protected_field_changes'
),
fk as (
  select c.confdeltype
  from pg_constraint c
  where c.conrelid = 'public.clubs'::regclass and c.contype = 'f'
    and c.confrelid = 'public.users'::regclass
    and c.conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.clubs'::regclass and attname = 'created_by')]
)
select 1 as sort, 'function has the FK-clearing exception' as check_name,
       coalesce((select position('sabha:creator-cleared-by-fk' in prosrc) > 0 from fn), false) as ok
union all
select 2, 'function is security definer with a fixed search_path',
       coalesce((select prosecdef and proconfig is not null from fn), false)
union all
select 3, 'trigger still runs it before update, for each row, enabled',
       coalesce((select fn = 'prevent_club_protected_field_changes'
                        and tgenabled = 'O' and (tgtype & 2) = 2 and (tgtype & 16) = 16
                        and (tgtype & 1) = 1 from trg), false)
union all
select 4, 'clubs.created_by is still ON DELETE SET NULL',
       coalesce((select confdeltype = 'n' from fk), false)
order by sort;
