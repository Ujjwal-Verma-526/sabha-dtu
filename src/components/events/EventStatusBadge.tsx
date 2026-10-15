import { cn } from "@/lib/utils";
import type { EventStatus } from "@/lib/supabase/types";

const styles: Record<EventStatus, string> = {
  draft: "border-control bg-surface text-ink-soft",
  published: "border-transparent bg-success-soft text-success",
  cancelled: "border-transparent bg-danger-soft text-danger",
  completed: "border-transparent bg-soft text-ink-soft",
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
        "inline-flex min-h-7 shrink-0 items-center rounded-full border px-2.5 text-[13px] font-semibold whitespace-nowrap",
        styles[status],
        className,
      )}
    >
      {labels[status]}
    </span>
  );
}
