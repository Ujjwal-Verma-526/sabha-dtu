import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-10 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between">
        <span className="font-display font-semibold text-ink">Sabha</span>
        <nav aria-label="Legal" className="flex gap-5">
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </nav>
        <span className="font-mono text-xs">
          Built for Delhi Technological University · MVP in progress
        </span>
      </div>
    </footer>
  );
}
