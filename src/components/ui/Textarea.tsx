import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

export function Textarea({
  className,
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  return (
    <textarea
      className={cn(
        "rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-primary",
        className,
      )}
      {...props}
    />
  );
}
