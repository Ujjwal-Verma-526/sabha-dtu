"use client";

import { useEffect } from "react";
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-32 text-center">
      <span className="font-mono text-xs uppercase tracking-widest text-ink-soft">
        Something broke
      </span>
      <h1 className="font-display text-3xl font-bold text-ink">
        That didn&apos;t go through.
      </h1>
      <p className="max-w-sm text-ink-soft">
        An error stopped this page from loading. It&apos;s been logged — try
        again.
      </p>
      <Button variant="primary" onClick={reset} className="mt-2">
        Try again
      </Button>
    </div>
  );
}
