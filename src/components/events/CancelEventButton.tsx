"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ui/ActionForm";
import { Button } from "@/components/ui/Button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type { ActionState } from "@/lib/action-state";

// Two-step inline confirm instead of window.confirm() — keeps the whole
// flow inside normal form/action UI rather than a blocking browser dialog.
export function CancelEventButton({
  cancelAction,
}: {
  cancelAction: (
    previous: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="text-sm text-danger"
        onClick={() => setConfirming(true)}
      >
        Cancel event
      </Button>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <span className="py-2 text-sm text-ink-soft">Cancel this event?</span>
      <Button
        type="button"
        variant="ghost"
        className="text-sm"
        onClick={() => setConfirming(false)}
      >
        No
      </Button>
      <ActionForm action={cancelAction}>
        <SubmitButton
          variant="primary"
          className="text-sm bg-red-600 hover:bg-red-700"
          pendingLabel="Cancelling…"
        >
          Yes, cancel it
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
