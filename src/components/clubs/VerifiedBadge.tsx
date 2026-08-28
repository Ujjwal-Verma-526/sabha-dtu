import { cn } from "@/lib/utils";

export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-primary",
        className,
      )}
      title="Verified DTU society"
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3 w-3"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M10 1.5l2.4 1.4 2.77-.3 1.13 2.55L18.8 7l-1.1 2.55.3 2.77-2.55 1.13L14 16.3l-2.77-.3L9.86 18l-1.86-2-2.77.3-1.13-2.55L1.5 12.6l1.1-2.55-.3-2.77L4.85 6.1 6 3.55l2.77.3L10 1.5z"
          clipRule="evenodd"
        />
        <path
          fill="var(--paper)"
          d="M8.6 12.3L6.3 10l-1 1 3.3 3.3 5.5-5.5-1-1z"
        />
      </svg>
      Verified
    </span>
  );
}
