import Link from "next/link";
import { signOut } from "@/app/profile/actions";
import { ButtonLink } from "@/components/ui/Button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DropdownMenu } from "@/components/layout/DropdownMenu";
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

  const navLinkClass =
    "text-[13px] font-medium text-ink-soft transition-colors hover:text-ink sm:text-sm";
  const adminLinkClass =
    "text-[13px] font-medium text-primary transition-colors hover:text-primary-dark sm:text-sm";

  const compactItems = [
    { href: "/tickets", label: "My tickets" },
    ...(roles.isSuperAdmin
      ? [{ href: "/admin/clubs", label: "Admin" }]
      : roles.managedClubs.map((club) => ({
          href: `/admin/clubs/${club.id}`,
          label: `Manage: ${club.name}`,
        }))),
    { href: "/profile", label: "Profile" },
  ];

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

        <div className="flex items-center gap-2 whitespace-nowrap sm:gap-6">
          {isSignedIn ? (
            <>
              {/* Below 400px the links collapse into one menu so the header
                  can't overflow however long the labels get. */}
              <DropdownMenu
                label="Menu"
                items={compactItems}
                className="min-[400px]:hidden"
              />
              <div className="hidden items-center gap-3 min-[400px]:flex sm:gap-6">
                <Link href="/tickets" className={navLinkClass}>
                  My tickets
                </Link>
                {roles.isSuperAdmin ? (
                  <Link href="/admin/clubs" className={adminLinkClass}>
                    Admin
                  </Link>
                ) : singleClub && otherClubs.length === 0 ? (
                  <Link
                    href={`/admin/clubs/${singleClub.id}`}
                    className={adminLinkClass}
                  >
                    Manage
                  </Link>
                ) : singleClub ? (
                  <DropdownMenu
                    label="Manage"
                    items={roles.managedClubs.map((club) => ({
                      href: `/admin/clubs/${club.id}`,
                      label: club.name,
                    }))}
                  />
                ) : null}
                <Link href="/profile" className={navLinkClass}>
                  Profile
                </Link>
              </div>
              <form action={signOut}>
                <SubmitButton
                  variant="ghost"
                  className="px-3! text-[13px] sm:px-5! sm:text-sm"
                >
                  Sign out
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              {/* Visible at every width (unlike the nav above): tickets are
                  mostly opened on a phone at the entrance. */}
              <Link href="/tickets" className={navLinkClass}>
                My tickets
              </Link>
              <ButtonLink href="/login" variant="primary" className="text-sm">
                Sign in
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
