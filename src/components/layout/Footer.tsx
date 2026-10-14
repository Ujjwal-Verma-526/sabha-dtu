import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between md:px-8">
        <span>
          <span className="font-semibold text-ink">Sabha</span> · Built for Delhi
          Technological University
        </span>
        <nav aria-label="Legal" className="flex gap-5">
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
