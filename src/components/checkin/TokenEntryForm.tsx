"use client";

import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";

// Type or paste a ticket's QR code, or use a USB/Bluetooth scanner that
// "types" the code and presses Enter. React resets the form after each
// submit, and the field takes focus again for the next code.
export function TokenEntryForm({ onSubmit }: { onSubmit: (token: string) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [submissions, formAction] = useActionState(
    async (previous: number, formData: FormData) => {
      const token = formData.get("token");
      if (typeof token === "string" && token.trim() !== "") {
        await onSubmit(token);
      }
      return previous + 1;
    },
    0,
  );

  // Refocus after each submission. On first load, only take focus where
  // there's a mouse or trackpad (on a phone it would open the keyboard over
  // the camera), and without scrolling the event details out of view.
  useEffect(() => {
    if (submissions > 0) {
      inputRef.current?.focus();
    } else if (window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [submissions]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="ticket-token" className="text-sm font-medium text-ink">
        Ticket code
      </label>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id="ticket-token"
          name="token"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          placeholder="32-character code"
          className="min-w-0 flex-1 font-mono"
        />
        <SubmitButton pendingLabel="Checking…" className="shrink-0">
          Check in
        </SubmitButton>
      </div>
      <p className="text-xs text-ink-soft">
        For a handheld scanner, or a code read by another QR app. The short code
        printed under the QR isn&apos;t accepted; search by name instead.
      </p>
    </form>
  );
}
