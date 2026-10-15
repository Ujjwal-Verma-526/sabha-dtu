import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

const variants = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  ghost: "border border-control bg-surface text-ink hover:border-ink",
  soft: "bg-soft text-ink hover:bg-line",
  danger: "border border-danger-line bg-surface text-danger hover:bg-danger-soft",
  /** The confirm step of a destructive action ("Yes, cancel it"). */
  dangerSolid: "bg-danger text-on-danger hover:opacity-90",
} as const;

type Variant = keyof typeof variants;

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60";

/** The button look for something that isn't a <button> or a next/link (an external or download <a>). */
export function buttonClass(variant: Variant = "primary", className?: string) {
  return cn(base, variants[variant], className);
}

type ButtonProps = ComponentPropsWithoutRef<"button"> & { variant?: Variant };

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button className={cn(base, variants[variant], className)} {...props} />
  );
}

type ButtonLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  variant?: Variant;
};

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={cn(base, variants[variant], className)} {...props} />
  );
}
