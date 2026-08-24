import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";

const navLinks = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#for-societies", label: "For societies" },
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
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <ButtonLink href="/login" variant="primary" className="text-sm">
          Sign in
        </ButtonLink>
      </div>
    </header>
  );
}
