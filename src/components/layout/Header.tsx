import Link from "next/link";
import { signOut } from "@/app/profile/actions";
import { ButtonLink } from "@/components/ui/Button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ManageMenu } from "@/components/layout/ManageMenu";
import { getViewerRoles } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

const navLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#for-societies", label: "For societies" },
];

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
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tight text-ink sm:text-xl"
        >
          Sabha
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link
            href="/clubs"
            className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
          >
            Clubs
          </Link>
          <Link
            href="/events"
            className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
          >
            Events
          </Link>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 whitespace-nowrap sm:gap-6">
          {/* Visible at every width (unlike the nav above): tickets are
              mostly opened on a phone at the entrance. */}
          <Link
            href="/tickets"
            className="text-[13px] font-medium sm:text-sm text-ink-soft transition-colors hover:text-ink"
          >
            <span className="sm:hidden">Tickets</span>
            <span className="hidden sm:inline">My tickets</span>
          </Link>
          {roles.isSuperAdmin ? (
            <Link
              href="/admin/clubs"
              className="text-[13px] font-medium sm:text-sm text-primary transition-colors hover:text-primary-dark"
            >
              Admin
            </Link>
          ) : singleClub && otherClubs.length === 0 ? (
            <Link
              href={`/admin/clubs/${singleClub.id}`}
              className="text-[13px] font-medium sm:text-sm text-primary transition-colors hover:text-primary-dark"
            >
              Manage
            </Link>
          ) : singleClub ? (
            <ManageMenu clubs={roles.managedClubs} />
          ) : null}
          {isSignedIn ? (
            <>
              <Link
                href="/profile"
                className="text-[13px] font-medium sm:text-sm text-ink-soft transition-colors hover:text-ink"
              >
                Profile
              </Link>
              <form action={signOut}>
                <SubmitButton variant="ghost" className="px-2.5! text-[13px] sm:px-5! sm:text-sm">
                  Sign out
                </SubmitButton>
              </form>
            </>
          ) : (
            <ButtonLink href="/login" variant="primary" className="text-sm">
              Sign in
            </ButtonLink>
          )}
        </div>
      </div>
    </header>
  );
}
