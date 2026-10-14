"use client";

import { useActionState } from "react";
import { idleState, type ActionState } from "@/lib/action-state";

type ActionFormProps = {
  /** Server action with its ids already bound: (previousState, formData). */
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  className?: string;
  children: React.ReactNode;
};

/**
 * <form> for a server action that reports its outcome. Shows the action's
 * error (or success message) under the form instead of failing silently.
 * Put a SubmitButton inside so the button disables while the action runs.
 */
export function ActionForm({ action, className, children }: ActionFormProps) {
  const [state, formAction] = useActionState(action, idleState);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="mt-2 text-sm text-success">
          {state.message}
        </p>
      )}
    </form>
  );
}
