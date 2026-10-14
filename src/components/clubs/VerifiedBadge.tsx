import { VerifiedTick } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

export function VerifiedBadge({
  className,
  label = true,
}: {
  className?: string;
  /** false: the tick alone (the title still names it). */
  label?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[13px] font-medium text-primary",
        className,
      )}
      title="Verified DTU society"
    >
      <VerifiedTick />
      {label ? "Verified" : <span className="sr-only">Verified DTU society</span>}
    </span>
  );
}
