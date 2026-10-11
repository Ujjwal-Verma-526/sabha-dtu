import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

// ComponentProps (not ...WithoutRef): in React 19 `ref` is an ordinary
// prop, and the spread passes it through to the <input>.
export function Input({
  className,
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-primary",
        className,
      )}
      {...props}
    />
  );
}
