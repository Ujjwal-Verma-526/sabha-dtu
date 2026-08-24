import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface p-6",
        className,
      )}
      {...props}
    />
  );
}
