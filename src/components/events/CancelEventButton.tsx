"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

// Two-step inline confirm instead of window.confirm() — keeps the whole
// flow inside normal form/action UI rather than a blocking browser dialog.
export function CancelEventButton({
  cancelAction,
}: {
  cancelAction: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="text-sm text-red-700"
        onClick={() => setConfirming(true)}
      >
        Cancel event
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-soft">Cancel this event?</span>
      <Button
        type="button"
        variant="ghost"
        className="text-sm"
        onClick={() => setConfirming(false)}
      >
        No
      </Button>
      <form action={cancelAction}>
        <Button type="submit" variant="primary" className="text-sm bg-red-600 hover:bg-red-700">
          Yes, cancel it
        </Button>
      </form>
    </div>
  );
}
