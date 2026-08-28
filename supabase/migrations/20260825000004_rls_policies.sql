-- Row Level Security. Every table here is enabled and given explicit,
-- narrow policies — no "authenticated users can do anything" policy
-- exists anywhere in this file. See the end-of-task review in the PR/
-- commit message for a walk-through of who can SELECT/INSERT/UPDATE/
-- DELETE on each table and why.

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------

alter table public.users enable row level security;

-- Read: only your own row, or a super_admin reading anyone's (needed for
-- future moderation/admin tooling). Other students' profiles, including
-- email, are not readable by default — nothing here exposes a directory.
create policy users_select_own_or_super_admin
  on public.users for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_super_admin(auth.uid())
  );

-- No INSERT policy: rows are created exclusively by the
-- handle_new_auth_user trigger (security definer, bypasses RLS). This is
-- deliberate — nothing an authenticated client sends can create a row
-- here.

-- Update: only your own row. The privilege-escalation trigger (see
-- 20260825000003) still blocks role/email/id changes even within this
-- policy, so this is defense in depth, not the only guard.
create policy users_update_own
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No DELETE policy: account deletion is not exposed to the client for
-- this MVP; it would need to go through a controlled server-side flow
-- given the on-delete-cascade/set-null behavior downstream.

-- ---------------------------------------------------------------------
-- clubs
-- ---------------------------------------------------------------------

alter table public.clubs enable row level security;

-- Read: verified clubs are public (anon included). An unverified club is
-- still visible to its own creator/members and to super_admins so they
-- can finish setting it up before it goes public.
create policy clubs_select_public_or_member
  on public.clubs for select
  using (
    verified = true
    or created_by = auth.uid()
    or exists (
      select 1 from public.club_members cm
      where cm.club_id = clubs.id and cm.user_id = auth.uid()
    )
    or public.is_super_admin(auth.uid())
  );

-- Insert: any authenticated user may propose a new club, but it always
-- starts unverified and attributed to themselves — verification is a
-- super_admin-only action performed via UPDATE.
create policy clubs_insert_self
  on public.clubs for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and verified = false
  );

-- Update: a club's own manager (approved admin/coordinator) can edit it,
-- but cannot verify it themselves — verified can only be flipped by a
-- super_admin. Both the USING and WITH CHECK sides enforce this so a
-- manager can't smuggle verified=true through an otherwise-legitimate
-- edit.
create policy clubs_update_manager_no_self_verify
  on public.clubs for update
  to authenticated
  using (
    public.is_club_manager(auth.uid(), id)
    or public.is_super_admin(auth.uid())
  )
  with check (
    public.is_super_admin(auth.uid())
    or (public.is_club_manager(auth.uid(), id) and verified = false)
  );

-- Delete: super_admin only. Deleting a club cascades to its events and
-- memberships, so this is intentionally not delegated to club managers.
create policy clubs_delete_super_admin
  on public.clubs for delete
  to authenticated
  using (public.is_super_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- club_members
-- ---------------------------------------------------------------------

alter table public.club_members enable row level security;

-- Read: your own membership row, any row in a club you manage, or
-- everything if you're a super_admin. A pending applicant can see their
-- own pending row (so the UI can show "request sent") but not anyone
-- else's.
create policy club_members_select_self_or_manager
  on public.club_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_club_manager(auth.uid(), club_id)
    or public.is_super_admin(auth.uid())
  );

-- Insert: either you're requesting to join yourself (always as a
-- pending, ordinary member — never self-approved, never a coordinator/
-- admin), or you're a manager/super_admin adding someone to your own
-- club directly (e.g. pre-approving a known member).
create policy club_members_insert_self_request_or_manager
  on public.club_members for insert
  to authenticated
  with check (
    (user_id = auth.uid() and role = 'member' and status = 'pending')
    or public.is_club_manager(auth.uid(), club_id)
    or public.is_super_admin(auth.uid())
  );

-- Update: club managers (approving/rejecting/promoting members) and
-- super_admins. The self-escalation trigger (20260825000003) blocks a
-- manager from using this path to change their OWN role/status, so a
-- coordinator can't promote themselves to admin through it.
create policy club_members_update_manager
  on public.club_members for update
  to authenticated
  using (
    public.is_club_manager(auth.uid(), club_id)
    or public.is_super_admin(auth.uid())
  )
  with check (
    public.is_club_manager(auth.uid(), club_id)
    or public.is_super_admin(auth.uid())
  );

-- Delete: you can remove your own membership (leave/withdraw a request),
-- a manager can remove someone from their own club, or a super_admin can
-- remove anyone.
create policy club_members_delete_self_or_manager
  on public.club_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_club_manager(auth.uid(), club_id)
    or public.is_super_admin(auth.uid())
  );

-- ---------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------

alter table public.events enable row level security;

-- Read: published events are public (anon included). Draft/cancelled/
-- completed events are only visible to the owning club's managers and
-- super_admins.
create policy events_select_published_or_manager
  on public.events for select
  using (
    status = 'published'
    or public.is_club_manager(auth.uid(), club_id)
    or public.is_super_admin(auth.uid())
  );

-- Insert: only a manager of the target club, and only attributed to
-- themselves.
create policy events_insert_club_manager
  on public.events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_club_manager(auth.uid(), club_id)
  );

-- Update: a manager of the event's club, or super_admin. WITH CHECK
-- re-evaluates against the NEW row, so an attempt to reassign club_id to
-- a club the caller doesn't manage is rejected — they'd fail the check
-- against the destination club, not just the source.
create policy events_update_club_manager
  on public.events for update
  to authenticated
  using (
    public.is_club_manager(auth.uid(), club_id)
    or public.is_super_admin(auth.uid())
  )
  with check (
    public.is_club_manager(auth.uid(), club_id)
    or public.is_super_admin(auth.uid())
  );

-- Delete: super_admin only. Club managers cancel an event by setting
-- status = 'cancelled' via UPDATE instead — deleting would cascade away
-- any registrations already made.
create policy events_delete_super_admin
  on public.events for delete
  to authenticated
  using (public.is_super_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- event_registrations
-- ---------------------------------------------------------------------

alter table public.event_registrations enable row level security;

-- Read: your own registration, or a manager of the event's club (to see
-- who's registered/checked in for their own events), or super_admin.
-- Nobody outside the club's management chain — and no anonymous user —
-- can read ticket codes or who registered.
create policy event_registrations_select_self_or_manager
  on public.event_registrations for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin(auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = event_registrations.event_id
        and public.is_club_manager(auth.uid(), e.club_id)
    )
  );

-- Insert: you may only register yourself, and only for an event that is
-- currently published. ticket_code is overwritten server-side regardless
-- of what's sent (see generate_ticket_code trigger), so nothing here
-- needs to validate it.
create policy event_registrations_insert_self
  on public.event_registrations for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'published'
    )
  );

-- Update: managers of the event's club, or super_admin, only. This is
-- deliberately not opened up to the registrant themselves — checked_in_at
-- must only ever be set by whoever is running the door, never by the
-- student holding the ticket.
create policy event_registrations_update_manager
  on public.event_registrations for update
  to authenticated
  using (
    public.is_super_admin(auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = event_registrations.event_id
        and public.is_club_manager(auth.uid(), e.club_id)
    )
  )
  with check (
    public.is_super_admin(auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = event_registrations.event_id
        and public.is_club_manager(auth.uid(), e.club_id)
    )
  );

-- Delete: you can cancel your own registration, a manager can remove a
-- registration from their own event, or super_admin can remove any.
create policy event_registrations_delete_self_or_manager
  on public.event_registrations for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin(auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = event_registrations.event_id
        and public.is_club_manager(auth.uid(), e.club_id)
    )
  );
