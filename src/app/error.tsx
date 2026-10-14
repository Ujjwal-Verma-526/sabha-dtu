"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-sm font-semibold text-danger">Something went wrong</p>
      <h1 className="font-display-tight mt-2 text-4xl text-ink">That didn&apos;t load.</h1>
      <p className="mt-3 max-w-sm text-ink-soft">
        An error stopped this page from loading. It&apos;s been logged. Try again, or head back
        to events.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link
          href="/events"
          className="inline-flex min-h-11 items-center rounded-xl bg-soft px-4 text-[15px] font-semibold text-ink hover:bg-line"
        >
          Back to events
        </Link>
      </div>
    </div>
  );
}
