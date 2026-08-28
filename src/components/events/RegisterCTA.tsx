"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

// Placeholder only — no registration record is created here. The real
// RSVP flow is a later, explicitly separate stage (see CLAUDE.md).
export function RegisterCTA() {
  const [clicked, setClicked] = useState(false);

  return (
    <div>
      <Button
        type="button"
        variant="primary"
        disabled={clicked}
        onClick={() => setClicked(true)}
        className="w-full sm:w-auto"
      >
        Register
      </Button>
      {clicked && (
        <p className="mt-2 text-sm text-ink-soft">
          Registration is coming soon — check back shortly.
        </p>
      )}
    </div>
  );
}
