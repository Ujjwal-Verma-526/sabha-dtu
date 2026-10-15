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
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-16 md:px-8 md:pt-11">
      <h1 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.035em] text-ink md:text-[40px]">
        {title}
      </h1>
      <p className="mt-2 text-[13px] font-medium text-ink-soft">Last updated {updated}</p>
      <div className="mt-8 space-y-4 text-base leading-relaxed text-ink [&_h2]:pt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_li+li]:mt-2 [&_strong]:font-semibold">
        {children}
      </div>
    </main>
  );
}
