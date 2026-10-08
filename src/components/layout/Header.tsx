import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";

const navLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#for-societies", label: "For societies" },
];

export function Header() {
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
          <ButtonLink href="/login" variant="primary" className="text-sm">
            Sign in
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
