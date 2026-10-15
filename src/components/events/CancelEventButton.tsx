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
      <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
        Cancel event
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-danger-soft px-3 py-2.5">
      <span className="mr-auto text-sm font-semibold text-danger">Cancel this event?</span>
      <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
        No
      </Button>
      <ActionForm action={cancelAction}>
        <SubmitButton variant="dangerSolid" pendingLabel="Cancelling…">
          Yes, cancel it
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
