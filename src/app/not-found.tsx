import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-32 text-center">
      <span className="font-mono text-xs uppercase tracking-widest text-ink-soft">
        404
      </span>
      <h1 className="font-display text-3xl font-bold text-ink">
        No event here.
      </h1>
      <p className="max-w-sm text-ink-soft">
        This page doesn&apos;t exist, or it hasn&apos;t been built yet.
      </p>
      <ButtonLink href="/" variant="primary" className="mt-2">
        Back to Sabha
      </ButtonLink>
    </div>
  );
}
