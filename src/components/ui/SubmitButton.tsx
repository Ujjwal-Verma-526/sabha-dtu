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
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
