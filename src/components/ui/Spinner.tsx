import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/** Grey placeholder block for loading skeletons. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn("block animate-pulse rounded-lg bg-soft motion-reduce:animate-none", className)}
    />
  );
}
