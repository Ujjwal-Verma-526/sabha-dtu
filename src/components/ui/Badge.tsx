import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

export function Badge({
  className,
  ...props
}: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs uppercase tracking-wide text-ink-soft",
        className,
      )}
      {...props}
    />
  );
}
