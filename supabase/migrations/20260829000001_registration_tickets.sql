-- QR ticket tokens. Each registration gets one unguessable token, stored in
-- its own table so that who can read it is decided by that table's RLS alone.
--
-- Why not reuse event_registrations.ticket_code: it is only 48 bits
-- (gen_random_bytes(6)), it is readable by club managers and super_admins
-- through event_registrations_select_self_or_manager, and it has already
-- been sent to and displayed in the browser. It stays as a short,
-- non-secret reference printed under the QR. The door check-in (built
-- later) must accept only the token below, never ticket_code.
--
-- Who can do what with registration_tickets:
--   SELECT  the registrant only (not club managers, not super_admins).
--   INSERT  nobody through the API; rows come from issue_registration_ticket().
--   UPDATE  nobody; and the token can never change, even for the owner role.
--   DELETE  nobody through the API; rows cascade with their registration.
-- Check-in will go through a security-definer RPC, so managers never need
-- to read tokens.
--
-- No existing policy is changed.

-- ---------------------------------------------------------------------
-- 0. pgcrypto must be in the `extensions` schema (the Supabase default).
--    Every call below is schema-qualified, so fail loudly here rather than
--    halfway through if this project is set up differently.
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  ) then
    raise exception 'pgcrypto must be installed in the extensions schema';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. registration_tickets
-- ---------------------------------------------------------------------
--
-- token: 16 cryptographically random bytes (128 bits) as 32 uppercase hex
-- characters. Fresh randomness, not derived from the registration id or
-- ticket_code. Uppercase hex keeps the QR in alphanumeric mode, which gives
-- a small, easy-to-scan code.

create table public.registration_tickets (
  registration_id uuid primary key
    references public.event_registrations (id) on delete cascade,
  token text not null unique
    default upper(encode(extensions.gen_random_bytes(16), 'hex')),
  created_at timestamptz not null default now(),
  constraint registration_tickets_token_format check (token ~ '^[0-9A-F]{32}$')
);

-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated. Take that back: signed-in users may only SELECT, and RLS
-- below narrows that to their own rows.
revoke all on table public.registration_tickets from public, anon, authenticated;
grant select on table public.registration_tickets to authenticated;

alter table public.registration_tickets enable row level security;

create policy registration_tickets_select_own
  on public.registration_tickets for select
  to authenticated
  using (
    exists (
      select 1 from public.event_registrations r
      where r.id = registration_tickets.registration_id
        and r.user_id = auth.uid()
    )
  );

-- No INSERT, UPDATE or DELETE policies: with RLS enabled, none of those
-- are possible through the API for anyone.

-- ---------------------------------------------------------------------
-- 2. Tokens are immutable, for every role
-- ---------------------------------------------------------------------
--
-- A trigger rather than only privileges, so this still holds if a policy
-- or grant is ever loosened by mistake. A future "reissue ticket" feature
-- would need its own explicit path that replaces this rule.

create function public.prevent_ticket_token_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.token is distinct from old.token
     or new.registration_id is distinct from old.registration_id then
    raise exception 'ticket tokens are immutable';
  end if;
  return new;
end;
$$;

create trigger registration_tickets_prevent_token_change
  before update on public.registration_tickets
  for each row execute function public.prevent_ticket_token_change();

-- ---------------------------------------------------------------------
-- 3. Issue a ticket for every new registration
-- ---------------------------------------------------------------------
--
-- AFTER INSERT, so it only runs once the registration has passed RLS and
-- the deadline/capacity checks in enforce_registration_rules. It runs in
-- the same transaction, so a registration never exists without a ticket.
-- Security definer because authenticated has no INSERT privilege on
-- registration_tickets; the token comes from the column default, never
-- from the caller.

create function public.issue_registration_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.registration_tickets (registration_id)
  values (new.id);
  return new;
end;
$$;

create trigger event_registrations_issue_ticket
  after insert on public.event_registrations
  for each row execute function public.issue_registration_ticket();

-- ---------------------------------------------------------------------
-- 4. Backfill existing registrations
-- ---------------------------------------------------------------------
--
-- Runs after the trigger is created on purpose: creating the trigger locks
-- event_registrations until this migration commits, so no registration can
-- land between the backfill and the trigger and be left without a ticket.

insert into public.registration_tickets (registration_id)
select id from public.event_registrations
on conflict (registration_id) do nothing;

-- ---------------------------------------------------------------------
-- 5. ticket_code is immutable too
-- ---------------------------------------------------------------------
--
-- generate_ticket_code() (20260825000003) sets it BEFORE INSERT; nothing
-- in the app or any migration writes it afterwards. Until now a club
-- manager could still rewrite it through event_registrations_update_manager.

create function public.prevent_ticket_code_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ticket_code is distinct from old.ticket_code then
    raise exception 'ticket_code is immutable';
  end if;
  return new;
end;
$$;

create trigger event_registrations_prevent_ticket_code_change
  before update on public.event_registrations
  for each row execute function public.prevent_ticket_code_change();

-- ---------------------------------------------------------------------
-- 6. get_my_registrations(): the caller's own registrations with event details
-- ---------------------------------------------------------------------
--
-- events_select_published_or_manager only shows students published events,
-- so a plain join would return null for an event that was cancelled or
-- completed after they registered. This function reads past that, but only
-- for events the caller is registered for. It takes no user_id parameter:
-- the user is always auth.uid(). It deliberately does NOT return the
-- token. Tokens are only ever read from registration_tickets, under its RLS.

create function public.get_my_registrations()
returns table (
  registration_id uuid,
  ticket_code text,
  checked_in_at timestamptz,
  registered_at timestamptz,
  event_id uuid,
  event_title text,
  event_slug text,
  event_venue text,
  event_start_at timestamptz,
  event_end_at timestamptz,
  event_status public.event_status,
  club_name text,
  club_slug text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    r.id,
    r.ticket_code,
    r.checked_in_at,
    r.registered_at,
    e.id,
    e.title,
    e.slug,
    e.venue,
    e.start_at,
    e.end_at,
    e.status,
    c.name,
    c.slug
  from public.event_registrations r
  join public.events e on e.id = r.event_id
  join public.clubs c on c.id = e.club_id
  where r.user_id = auth.uid()
  order by e.start_at;
$$;

revoke execute on function public.get_my_registrations() from public, anon;
grant execute on function public.get_my_registrations() to authenticated;
