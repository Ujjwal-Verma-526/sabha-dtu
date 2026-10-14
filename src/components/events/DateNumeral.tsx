import { istDayParts } from "@/lib/ist";
import { cn } from "@/lib/utils";

/**
 * The big date: "16" with "FRI · OCT" beside or under it, in IST.
 * Screen readers get one plain label instead of the pieces.
 */
export function DateNumeral({
  instant,
  className,
  numeralClassName,
  children,
}: {
  instant: Date | string;
  className?: string;
  numeralClassName?: string;
  /** Extra lines under the weekday · month label (e.g. "In 3 days"). */
  children?: React.ReactNode;
}) {
  const { weekday, day, month } = istDayParts(instant);
  return (
    <div className={cn("flex items-end gap-2.5", className)}>
      <span className="sr-only">{`${weekday} ${day} ${month}`}</span>
      <b
        aria-hidden="true"
        className={cn(
          "font-display-tight text-[44px] leading-[0.8] tabular-nums text-ink",
          numeralClassName,
        )}
      >
        {day}
      </b>
      <span className="pb-px">
        <span
          aria-hidden="true"
          className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-ink"
        >
          {weekday} · {month}
        </span>
        {children}
      </span>
    </div>
  );
}
