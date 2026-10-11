"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import type { RegisterResult } from "@/app/events/[slug]/actions";

export type RegisterCTAState =
  | "idle"
  | "registered"
  | "full"
  | "closed"
  | "cancelled"
  | "login_required";

export function RegisterCTA({
  initialState,
  initialTicketCode = null,
  initialRegistrationId = null,
  registerAction,
}: {
  initialState: RegisterCTAState;
  initialTicketCode?: string | null;
  initialRegistrationId?: string | null;
  registerAction: () => Promise<RegisterResult>;
}) {
  const [state, setState] = useState<RegisterCTAState>(initialState);
  const [ticketCode, setTicketCode] = useState<string | null>(
    initialTicketCode,
  );
  const [registrationId, setRegistrationId] = useState<string | null>(
    initialRegistrationId,
  );
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    if (registering) return; // avoid duplicate submissions from a double click
    setRegistering(true);
    setError(null);

    try {
      const result = await registerAction();

      if (result.ok) {
        setTicketCode(result.ticketCode);
        setRegistrationId(result.registrationId);
        setState("registered");
        return;
      }

      switch (result.reason) {
        case "login_required":
          setState("login_required");
          break;
        case "cancelled":
          setState("cancelled");
          break;
        case "full":
          setState("full");
          break;
        case "closed":
        case "registration_closed":
        case "not_found":
          setState("closed");
          break;
        default:
          setError(result.message);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setRegistering(false);
    }
  }

  if (state === "cancelled") {
    return <Badge className="border-red-200 bg-red-50 text-red-700">Event Cancelled</Badge>;
  }

  if (state === "full") {
    return <Badge>Event Full</Badge>;
  }

  if (state === "closed") {
    return <Badge>Registration closed</Badge>;
  }

  if (state === "login_required") {
    return (
      <ButtonLink href="/login" variant="primary" className="w-full sm:w-auto">
        Login to register
      </ButtonLink>
    );
  }

  if (state === "registered") {
    return (
      <div>
        <Badge className="border-primary/30 bg-primary/10 text-primary">
          You&apos;re registered
        </Badge>
        {ticketCode && (
          <p className="mt-2 font-mono text-xs uppercase tracking-wide text-ink-soft">
            Ticket {ticketCode}
          </p>
        )}
        <ButtonLink
          href={registrationId ? `/tickets#ticket-${registrationId}` : "/tickets"}
          variant="accent"
          className="mt-4 w-full sm:w-auto"
        >
          View your ticket →
        </ButtonLink>
      </div>
    );
  }

  return (
    <div>
      <Button
        type="button"
        variant="primary"
        disabled={registering}
        onClick={handleRegister}
        className="w-full gap-2 sm:w-auto"
      >
        {registering && <Spinner className="h-4 w-4 border-white/40 border-t-white" />}
        {registering ? "Registering…" : "Register"}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
