import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

// Shared with Textarea and native selects: 3:1 border, 16px text (so iOS
// doesn't zoom on focus), a visible focus ring, and a red border when the
// field is aria-invalid.
export const fieldClass =
  "rounded-xl border border-control bg-surface px-3.5 py-2.5 text-base text-ink outline-none placeholder:text-ink-soft focus:border-primary focus:ring-3 focus:ring-primary/25 aria-invalid:border-danger";

// ComponentProps (not ...WithoutRef): in React 19 `ref` is an ordinary
// prop, and the spread passes it through to the <input>.
export function Input({
  className,
  ...props
}: ComponentProps<"input">) {
  return <input className={cn(fieldClass, "min-h-12", className)} {...props} />;
}
