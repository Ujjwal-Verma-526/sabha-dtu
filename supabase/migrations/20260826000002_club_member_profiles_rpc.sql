-- New need from this feature: a club admin managing membership requests
-- has to see WHO is requesting (a name), but club_members only stores
-- user_id, and public.users' RLS (deliberately) only lets someone read
-- their own profile or a super_admin read anyone's — a plain club
-- manager reading another applicant's name would be denied, same as any
-- other student.
--
-- Rather than widen users' SELECT policy (which would let any club
-- manager read the full profile — including email — of anyone who ever
-- applied to any club they run, forever, well beyond what "see who's
-- pending" needs), this is a narrow security-definer function: it
-- returns only name + avatar_url, only for members/applicants of one
-- specific club, and only to that club's own manager or a super_admin.
-- No email, no other user's data leaks through it.

create function public.get_club_member_profiles(target_club uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  name text,
  avatar_url text,
  role public.club_member_role,
  status public.club_member_status,
  joined_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select cm.id, u.id, u.name, u.avatar_url, cm.role, cm.status, cm.joined_at
  from public.club_members cm
  join public.users u on u.id = cm.user_id
  where cm.club_id = target_club
    and (public.is_club_manager(auth.uid(), target_club) or public.is_super_admin(auth.uid()));
$$;

grant execute on function public.get_club_member_profiles(uuid) to authenticated;
