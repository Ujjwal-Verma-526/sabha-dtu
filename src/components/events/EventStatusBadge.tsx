import { cn } from "@/lib/utils";
import type { EventStatus } from "@/lib/supabase/types";

const styles: Record<EventStatus, string> = {
  draft: "border-line bg-surface text-ink-soft",
  published: "border-primary/30 bg-primary/10 text-primary",
  cancelled: "border-red-200 bg-red-50 text-red-700",
  completed: "border-line bg-ink/5 text-ink-soft",
};

const labels: Record<EventStatus, string> = {
  draft: "Draft",
  published: "Published",
  cancelled: "Cancelled",
  completed: "Completed",
};

export function EventStatusBadge({
  status,
  className,
}: {
  status: EventStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wide",
        styles[status],
        className,
      )}
    >
      {labels[status]}
    </span>
  );
}
