/**
 * Result of a server action that doesn't redirect, for use with
 * useActionState (see components/ui/ActionForm.tsx).
 */
export type ActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export const idleState: ActionState = { status: "idle" };

export function actionSuccess(message: string): ActionState {
  return { status: "success", message };
}

export function actionError(message: string): ActionState {
  return { status: "error", message };
}
