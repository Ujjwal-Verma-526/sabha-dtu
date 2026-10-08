import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TicketState } from "@/lib/tickets";

export type TicketStubData = {
  registrationId: string;
  ticketCode: string;
  checkedInAt: string | null;
  eventTitle: string;
  eventSlug: string;
  eventVenue: string | null;
  eventStartAt: string;
  clubName: string;
};

// DTU events are in IST; the server may run in UTC (Vercel), so the zone
// is set explicitly rather than taken from the server.
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const timeFormat = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const stateLabel: Record<TicketState, string> = {
  active: "Admit one",
  on_hold: "On hold",
  ended: "Event ended",
  cancelled: "Cancelled",
};

// Same base as Badge, but with the colours supplied here instead of
// overriding Badge's own: there's no tailwind-merge, so a conflicting
// bg-/border-/text- class on Badge wins or loses by CSS order, not intent.
const pillBase =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wide";

const stateBadgeClass: Record<TicketState, string> = {
  active: "border-accent bg-accent text-ink",
  on_hold: "border-line bg-surface text-ink-soft",
  ended: "border-line bg-ink/5 text-ink-soft",
  cancelled: "border-red-200 bg-red-50 text-red-700",
};

// Shown in place of the QR for every state that must not be scannable.
const noQrMessage: Record<Exclude<TicketState, "active">, string> = {
  on_hold:
    "The organisers have unpublished this event. Your registration is kept, and your QR will show here if it goes live again.",
  ended: "This event is over. No entry QR is shown.",
  cancelled: "This event was cancelled. There is no entry QR for it.",
};

export function TicketStub({
  ticket,
  state,
  qrSvg,
}: {
  ticket: TicketStubData;
  state: TicketState;
  // Server-rendered SVG markup for the token; only passed for active tickets.
  qrSvg: string | null;
}) {
  const start = new Date(ticket.eventStartAt);
  const muted = state === "ended" || state === "cancelled";

  return (
    <article
      id={`ticket-${ticket.registrationId}`}
      className={cn(
        "scroll-mt-24 rounded-2xl border border-line bg-surface p-5 shadow-[0_20px_50px_-20px_rgba(21,22,26,0.25)] target:ring-2 target:ring-primary",
        muted && "shadow-none",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-lg font-bold text-ink">Sabha</span>
        <span className={cn(pillBase, stateBadgeClass[state])}>
          {stateLabel[state]}
        </span>
      </div>

      <p className="mt-4 font-mono text-xs uppercase tracking-wide text-ink-soft">
        {ticket.clubName}
      </p>
      <h2
        className={cn(
          "mt-1 font-display text-xl font-semibold leading-tight",
          muted ? "text-ink-soft" : "text-ink",
          state === "cancelled" && "line-through decoration-red-400",
        )}
      >
        {state === "active" ? (
          <Link href={`/events/${ticket.eventSlug}`} className="hover:text-primary">
            {ticket.eventTitle}
          </Link>
        ) : (
          ticket.eventTitle
        )}
      </h2>
      <p className="mt-1 font-mono text-xs text-ink-soft">
        {dateFormat.format(start)} · {timeFormat.format(start)}
        {ticket.eventVenue && <> · {ticket.eventVenue}</>}
      </p>

      <div className="ticket-perf my-5" />

      {state === "active" && qrSvg ? (
        <div className="flex flex-col items-center">
          <div
            role="img"
            aria-label={`QR ticket for ${ticket.eventTitle}`}
            className="h-48 w-48 [&>svg]:h-full [&>svg]:w-full"
            // Markup comes from the qrcode library, built from a token that
            // renderTicketQrSvg has already validated as 32 hex characters.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-3 text-center font-mono text-[10px] tracking-[0.2em] text-ink-soft">
            {ticket.ticketCode}
          </p>
          {ticket.checkedInAt ? (
            <span
              className={cn(pillBase, "mt-3 border-primary/30 bg-primary/10 text-primary")}
            >
              Checked in
            </span>
          ) : (
            <p className="mt-3 text-center text-xs text-ink-soft">
              Show this QR at the entrance.
            </p>
          )}
        </div>
      ) : state === "active" ? (
        // An active registration without a ticket row should not happen
        // (the issue_registration_ticket trigger runs in the same
        // transaction), but say so plainly rather than show nothing.
        <p className="text-center text-sm text-red-700">
          Your QR couldn&apos;t be loaded. Refresh the page; if it still
          doesn&apos;t appear, contact the organisers with code{" "}
          <span className="font-mono">{ticket.ticketCode}</span>.
        </p>
      ) : (
        <div
          className={cn(
            "mx-auto flex h-48 w-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center",
            state === "cancelled"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-line bg-ink/5 text-ink-soft",
          )}
        >
          <span className="font-mono text-xs font-bold uppercase tracking-widest">
            {stateLabel[state]}
          </span>
          <span className="text-xs">{noQrMessage[state]}</span>
        </div>
      )}
    </article>
  );
}
