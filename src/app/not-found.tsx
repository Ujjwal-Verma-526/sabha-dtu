import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center md:py-28">
      <p className="text-sm font-semibold text-ink-soft">404 · Page not found</p>
      <h1 className="font-display-tight mt-2 text-[44px] leading-[0.95] text-ink md:text-[64px]">
        Nothing here.
      </h1>
      <p className="mt-4 max-w-sm text-ink-soft">
        This page doesn&apos;t exist, or it hasn&apos;t been built yet.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <ButtonLink href="/events">Browse events</ButtonLink>
        <ButtonLink href="/" variant="soft">
          Back to Sabha
        </ButtonLink>
      </div>
    </main>
  );
}
