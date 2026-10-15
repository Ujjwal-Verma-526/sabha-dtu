"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

type SubmitButtonProps = Omit<React.ComponentProps<typeof Button>, "type"> & {
  /** Shown instead of the children while the form is submitting. */
  pendingLabel?: string;
};

/**
 * Submit button for forms that post to a server action. It disables itself
 * while the action is running so a double-click can't submit twice (which
 * would create duplicate rows). Must be rendered inside the <form>.
 *
 * With several submit buttons told apart by name/value, every one disables
 * but only the pressed one shows its pendingLabel (React puts the
 * submitter's name/value in the submitted FormData).
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending, data } = useFormStatus();
  const pressed =
    pending &&
    (typeof props.name !== "string" || data?.get(props.name) === String(props.value));

  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pressed && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
