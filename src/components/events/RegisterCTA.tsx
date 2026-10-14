"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import type { RegisterResult } from "@/app/events/[slug]/actions";
import { cn } from "@/lib/utils";

export type RegisterCTAState =
  | "idle"
  | "registered"
  | "full"
  | "closed"
  | "cancelled"
  | "login_required";

/**
 * The event page's registration box: a bar pinned to the bottom of the
 * screen on phones, a card in the page from md up. One instance, so the
 * state can't disagree between the two.
 */
export function RegisterCTA({
  initialState,
  initialRegistrationId = null,
  spotsLine,
  closesLine,
  registerAction,
}: {
  initialState: RegisterCTAState;
  initialRegistrationId?: string | null;
  /** "Free · 12 spots left" */
  spotsLine: string;
  /** "Registration closes Fri 16 Oct, 2:00 pm" */
  closesLine: string;
  registerAction: () => Promise<RegisterResult>;
}) {
  const [state, setState] = useState<RegisterCTAState>(initialState);
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

  let headline: React.ReactNode = spotsLine;
  let detail: React.ReactNode = closesLine;
  let action: React.ReactNode = null;
  let note: string | null = null;

  switch (state) {
    case "idle":
      action = (
        <Button
          type="button"
          disabled={registering}
          onClick={handleRegister}
          className="min-h-12 px-6 md:w-full"
        >
          {registering && <Spinner className="h-4 w-4 border-on-primary/40 border-t-on-primary" />}
          {registering ? "Registering…" : "Register"}
        </Button>
      );
      note = "One tap. Your QR ticket appears in My tickets.";
      break;
    case "login_required":
      action = (
        <ButtonLink href="/login" className="min-h-12 px-5 md:w-full">
          Sign in to register
        </ButtonLink>
      );
      note = "Free. Your QR ticket appears in My tickets.";
      break;
    case "registered":
      headline = (
        <span className="inline-flex items-center gap-1.5 text-success">
          <Icon name="check" strokeWidth={2.4} />
          You&apos;re going
        </span>
      );
      detail = "Show your QR ticket at the door.";
      action = (
        <ButtonLink
          href={registrationId ? `/tickets#ticket-${registrationId}` : "/tickets"}
          variant="ghost"
          className="min-h-12 md:w-full"
        >
          <Icon name="ticket" className="text-lg" />
          View ticket
        </ButtonLink>
      );
      break;
    case "full":
      headline = "Event full";
      detail = "Every spot is taken.";
      break;
    case "closed":
      headline = "Registration closed";
      detail = closesLine.replace(/^Registration clos(es|ed)/, "Closed");
      break;
    case "cancelled":
      headline = <span className="text-danger">Event cancelled</span>;
      detail = "The society has cancelled this event.";
      break;
  }

  return (
    <div
      data-sticky-cta
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md",
        "md:static md:z-auto md:max-w-[560px] md:rounded-2xl md:border md:bg-surface md:p-5 md:shadow-card md:backdrop-blur-none",
      )}
    >
      <div className="flex items-center gap-3 md:block">
        <div className="min-w-0 flex-1 md:flex md:items-baseline md:justify-between md:gap-4">
          <p className="truncate text-[15px] font-semibold text-ink">{headline}</p>
          <p className="truncate text-[12.5px] text-ink-soft md:text-[13px]">{detail}</p>
        </div>
        {action && <div className="shrink-0 md:mt-3.5">{action}</div>}
      </div>
      {note && <p className="mt-2.5 hidden text-center text-[13px] text-ink-soft md:block">{note}</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
