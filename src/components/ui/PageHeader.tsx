import { cn } from "@/lib/utils";

/**
 * Title block for the plain pages (tickets, profile, clubs, manage). Actions
 * sit to the right of the title from `sm` up, and under it on phones.
 */
export function PageHeader({
  title,
  description,
  actions,
  size = "lg",
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** "md" for the manage pages, which are about the form, not the title. */
  size?: "lg" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1
          className={cn(
            "font-semibold tracking-[-0.035em] break-words text-ink",
            size === "lg"
              ? "text-[30px] leading-[1.1] md:text-[40px]"
              : "text-[26px] leading-[1.15] md:text-[32px]",
          )}
        >
          {title}
        </h1>
        {description && <div className="mt-1.5 text-ink-soft">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Small grey section label, as on the event page ("Hosted by", "About"). */
export const sectionHeadingClass = "text-[13px] font-semibold text-ink-soft";
