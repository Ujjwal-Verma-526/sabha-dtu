-- Core schema: enums, tables, constraints, indexes, updated_at triggers.
-- No RLS here — see 20260825000004_rls_policies.sql. Tables are locked down
-- by default the moment RLS is enabled in that migration; this file alone
-- would leave them wide open, so the two must always ship together.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type public.user_role as enum ('student', 'club_admin', 'super_admin');

create type public.club_member_role as enum ('member', 'coordinator', 'admin');
create type public.club_member_status as enum ('pending', 'approved', 'rejected');

create type public.event_status as enum ('draft', 'published', 'cancelled', 'completed');

-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- users — one row per authenticated person, id = auth.users.id
-- ---------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  roll_number text,
  branch text,
  batch_year integer,
  avatar_url text,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_batch_year_range check (
    batch_year is null or batch_year between 2000 and 2100
  )
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- clubs
-- ---------------------------------------------------------------------

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  category text,
  instagram_handle text,
  verified boolean not null default false,
  -- Deleting the creator's account must not destroy the club they built —
  -- keep the club, just drop the attribution.
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index clubs_created_by_idx on public.clubs (created_by);
create index clubs_verified_idx on public.clubs (verified);

create trigger clubs_set_updated_at
  before update on public.clubs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- club_members
-- ---------------------------------------------------------------------

create table public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  -- A user's own membership rows are their data — fine to cascade with them.
  user_id uuid not null references public.users (id) on delete cascade,
  role public.club_member_role not null default 'member',
  status public.club_member_status not null default 'pending',
  joined_at timestamptz not null default now(),
  unique (club_id, user_id)
);

create index club_members_club_id_idx on public.club_members (club_id);
create index club_members_user_id_idx on public.club_members (user_id);

-- ---------------------------------------------------------------------
-- events — table created now for the RLS/authorization model; no UI yet.
-- ---------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  title text not null,
  slug text not null unique,
  description text,
  banner_url text,
  venue text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  registration_deadline timestamptz,
  capacity integer,
  status public.event_status not null default 'draft',
  -- Same reasoning as clubs.created_by: keep the event, drop attribution.
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint events_end_after_start check (end_at >= start_at),
  constraint events_deadline_before_start check (
    registration_deadline is null or registration_deadline <= start_at
  ),
  constraint events_capacity_positive check (capacity is null or capacity > 0)
);

create index events_club_id_idx on public.events (club_id);
create index events_status_idx on public.events (status);
create index events_start_at_idx on public.events (start_at);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- event_registrations — table created now for the RLS model; no UI yet.
-- ---------------------------------------------------------------------

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- A user's own registration is their data — fine to cascade with them.
  user_id uuid not null references public.users (id) on delete cascade,
  ticket_code text not null unique,
  checked_in_at timestamptz,
  registered_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index event_registrations_event_id_idx on public.event_registrations (event_id);
create index event_registrations_user_id_idx on public.event_registrations (user_id);
