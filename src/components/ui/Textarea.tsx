import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";
import { fieldClass } from "@/components/ui/Input";

export function Textarea({
  className,
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cn(fieldClass, className)} {...props} />;
}
