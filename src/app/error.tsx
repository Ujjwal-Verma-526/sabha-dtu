"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";

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
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center md:py-28">
      <p className="text-sm font-semibold text-danger">Something went wrong</p>
      <h1 className="font-display-tight mt-2 text-[44px] leading-[0.95] text-ink md:text-[64px]">
        That didn&apos;t load.
      </h1>
      <p className="mt-3 max-w-sm text-ink-soft">
        An error stopped this page from loading. It&apos;s been logged. Try again, or head back
        to events.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/events" variant="soft">
          Back to events
        </ButtonLink>
      </div>
    </div>
  );
}
