import type { ReactNode } from "react";

const CONTACT_EMAIL = "vermaujjwal526@gmail.com";

export function ContactLink() {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="font-medium text-primary underline"
    >
      {CONTACT_EMAIL}
    </a>
  );
}

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="font-display text-4xl font-bold tracking-tight text-ink">
        {title}
      </h1>
      <p className="mt-2 font-mono text-xs uppercase tracking-widest text-ink-soft">
        Last updated {updated}
      </p>
      <div className="mt-8 space-y-4 text-ink-soft [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
        {children}
      </div>
    </main>
  );
}
