import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

const tones = {
  neutral: "bg-soft text-ink-soft",
  primary: "bg-primary-soft text-primary-soft-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentPropsWithoutRef<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
