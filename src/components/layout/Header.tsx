import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { DropdownMenu } from "@/components/layout/DropdownMenu";
import { BackLink, DesktopNav, ProfileLink } from "@/components/layout/NavLinks";
import { getViewerRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/Logo";

const manageLinkClass =
  "inline-flex h-9 items-center gap-1.5 rounded-lg bg-soft px-3 text-sm font-medium text-ink transition-colors hover:bg-line";

export async function Header() {
  // Reading cookies makes this (and the root layout) render per request, so
  // the header always reflects the real session. getClaims() verifies the
  // JWT without a network round trip; it's only used for display here —
  // every protected page still does its own getUser() check.
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  // Display-only: decides which links to show. The admin pages themselves
  // re-check access on the server. The name and photo are the viewer's own
  // row, under users' own-row RLS.
  const [roles, profile] = userId
    ? await Promise.all([
        getViewerRoles(supabase, userId),
        supabase
          .from("users")
          .select("name, avatar_url")
          .eq("id", userId)
          .maybeSingle()
          .then(({ data }) => data),
      ])
    : [{ isSuperAdmin: false, managedClubs: [] }, null];
  const [singleClub, ...otherClubs] = roles.managedClubs;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:h-16 md:px-8">
        <div className="flex items-center gap-1">
          <BackLink />
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
        </div>

        <DesktopNav />

        <div className="flex items-center gap-2 whitespace-nowrap">
          {roles.isSuperAdmin ? (
            <Link href="/admin/clubs" className={manageLinkClass}>
              <Icon name="manage" />
              Manage
            </Link>
          ) : singleClub && otherClubs.length === 0 ? (
            <Link href={`/admin/clubs/${singleClub.id}`} className={manageLinkClass}>
              <Icon name="manage" />
              Manage
            </Link>
          ) : singleClub ? (
            <DropdownMenu
              label="Manage"
              buttonClassName={manageLinkClass}
              items={roles.managedClubs.map((club) => ({
                href: `/admin/clubs/${club.id}`,
                label: club.name,
              }))}
            />
          ) : null}

          {userId ? (
            <ProfileLink>
              <Avatar
                name={profile?.name}
                avatarUrl={profile?.avatar_url}
                userId={userId}
                className="text-[13px]"
              />
            </ProfileLink>
          ) : (
            // Phones get "Sign in" in the tab bar instead.
            <span className="hidden md:block">
              <ButtonLink href="/login" className="min-h-9 px-3.5 text-sm">
                Sign in
              </ButtonLink>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
