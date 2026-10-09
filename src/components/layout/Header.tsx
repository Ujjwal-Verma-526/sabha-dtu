import Link from "next/link";
import { signOut } from "@/app/profile/actions";
import { Button, ButtonLink } from "@/components/ui/Button";
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
  const isSignedIn = Boolean(claimsData?.claims);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="font-display text-xl font-bold tracking-tight text-ink"
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

        <div className="flex items-center gap-4 sm:gap-6">
          {/* Visible at every width (unlike the nav above): tickets are
              mostly opened on a phone at the entrance. */}
          <Link
            href="/tickets"
            className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
          >
            My tickets
          </Link>
          {isSignedIn ? (
            <>
              <Link
                href="/profile"
                className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
              >
                Profile
              </Link>
              <form action={signOut}>
                <Button type="submit" variant="ghost" className="text-sm">
                  Sign out
                </Button>
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
