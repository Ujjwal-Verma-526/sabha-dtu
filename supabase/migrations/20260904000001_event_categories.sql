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
