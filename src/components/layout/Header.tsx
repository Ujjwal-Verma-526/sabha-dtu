import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { DropdownMenu } from "@/components/layout/DropdownMenu";
import { DesktopNav, ProfileLink } from "@/components/layout/NavLinks";
import { getViewerRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

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
  const isSignedIn = Boolean(userId);
  // Display-only: decides which links to show. The admin pages themselves
  // re-check access on the server.
  const roles = userId
    ? await getViewerRoles(supabase, userId)
    : { isSuperAdmin: false, managedClubs: [] };
  const [singleClub, ...otherClubs] = roles.managedClubs;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:h-16 md:px-8">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-[19px] font-semibold tracking-[-0.03em] text-ink"
        >
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-saffron" />
          Sabha
        </Link>

        <DesktopNav />

        <div className="flex items-center gap-2 whitespace-nowrap">
          {roles.isSuperAdmin ? (
            <Link href="/admin/clubs" className={manageLinkClass}>
              <Icon name="manage" />
              Admin
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

          {isSignedIn ? (
            <ProfileLink />
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
