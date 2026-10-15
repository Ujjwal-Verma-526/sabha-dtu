import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { formatIstDateTime, formatIstShortDate, formatIstTime, isSameIstDay } from "@/lib/ist";
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
  eventEndAt: string;
  clubName: string;
};

// "Checked in at 6:42 pm", with the date too if it isn't the event's day.
function checkedInLabel(checkedInAt: string, eventStartAt: string): string {
  return isSameIstDay(checkedInAt, eventStartAt)
    ? `Checked in at ${formatIstTime(checkedInAt)}`
    : `Checked in at ${formatIstDateTime(checkedInAt)}`;
}

/** "Fri, 16 Oct · 6:30 pm – 9:30 pm", in IST like every event time. */
function whenLabel(startAt: string, endAt: string): string {
  const start = `${formatIstShortDate(startAt)} · ${formatIstTime(startAt)}`;
  if (endAt === startAt) return start;
  return isSameIstDay(startAt, endAt)
    ? `${start} – ${formatIstTime(endAt)}`
    : `${start} – ${formatIstShortDate(endAt)}, ${formatIstTime(endAt)}`;
}

/** "44A8A05A48BF" → "44A8 A05A 48BF", easier to read out at the door. */
function groupedCode(code: string): string {
  return code.match(/.{1,4}/g)?.join(" ") ?? code;
}

const ON_HOLD_MESSAGE =
  "The organisers have unpublished this event. Your registration is kept, and your QR will show here if it goes live again.";

/**
 * A current ticket: a white card with a black QR in both themes (the
 * .theme-light scope pins its tokens to the light values), so it scans the
 * same in sunlight and in dark mode. The attendee's name is on it; this page
 * is only ever shown to the ticket's owner.
 */
export function TicketStub({
  ticket,
  state,
  qrSvg,
  attendeeName,
}: {
  ticket: TicketStubData;
  state: Extract<TicketState, "active" | "on_hold">;
  // Server-rendered SVG markup for the token; only passed for active tickets.
  qrSvg: string | null;
  attendeeName: string | null;
}) {
  return (
    // The outline sits outside the white card, on the page, so it takes the
    // page's own violet rather than the card's.
    <article
      id={`ticket-${ticket.registrationId}`}
      className="scroll-mt-24 rounded-[20px] target:outline-3 target:outline-offset-4 target:outline-primary"
    >
      <div className="theme-light overflow-hidden rounded-[20px] border border-line shadow-card">
        <div className="px-5 pt-5 pb-4">
          {state === "on_hold" ? (
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warning">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
              On hold
            </p>
          ) : ticket.checkedInAt ? (
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-success">
              <Icon name="check" strokeWidth={2.6} className="text-[15px]" />
              {checkedInLabel(ticket.checkedInAt, ticket.eventStartAt)}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-success">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
              Admit one
            </p>
          )}
          <h2 className="mt-1.5 text-[21px] leading-[1.2] font-semibold tracking-[-0.025em] break-words text-ink">
            {state === "active" ? (
              <Link href={`/events/${ticket.eventSlug}`} className="hover:underline">
                {ticket.eventTitle}
              </Link>
            ) : (
              ticket.eventTitle
            )}
          </h2>
          <p className="mt-1 text-sm text-ink">
            {ticket.clubName} · {whenLabel(ticket.eventStartAt, ticket.eventEndAt)}
          </p>
          {ticket.eventVenue && (
            <p className="mt-0.5 flex items-start gap-1.5 text-sm text-ink">
              <Icon name="pin" className="mt-[3px] text-ink-soft" />
              {ticket.eventVenue}
            </p>
          )}
        </div>

        <div aria-hidden="true" className="mx-5 border-t-2 border-dashed border-line" />

        {state === "active" && qrSvg ? (
          <>
            <div className="flex flex-col items-center px-5 pt-5">
              <div
                role="img"
                aria-label={`Entry QR code for ${ticket.eventTitle}`}
                className="w-full max-w-[272px] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                // Markup comes from the qrcode library, built from a token that
                // renderTicketQrSvg has already validated as 32 hex characters.
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              {attendeeName && (
                <p className="mt-2 text-center text-base font-semibold break-words text-ink">
                  {attendeeName}
                </p>
              )}
              <p className="mt-0.5 font-mono text-[13px] tracking-[0.04em] text-ink-soft">
                Ref {groupedCode(ticket.ticketCode)}
              </p>
            </div>
            <p className="mt-4 bg-soft px-5 pt-3 pb-4 text-[13.5px] text-ink-soft">
              <b className="font-semibold text-ink">Turn your brightness up</b> at the door. If the
              scanner can&apos;t read it, give the door team your name.
            </p>
          </>
        ) : state === "active" ? (
          // An active registration without a ticket row should not happen
          // (the issue_registration_ticket trigger runs in the same
          // transaction), but say so plainly rather than show nothing.
          <p className="px-5 py-5 text-sm font-medium text-danger">
            Your QR couldn&apos;t be loaded. Refresh the page; if it still doesn&apos;t appear,
            contact the organisers with code{" "}
            <span className="font-mono">{groupedCode(ticket.ticketCode)}</span>.
          </p>
        ) : (
          <div className="px-5 py-5">
            <p className="rounded-xl border border-dashed border-control bg-soft px-4 py-5 text-center text-sm text-ink">
              {ON_HOLD_MESSAGE}
            </p>
            <p className="mt-3 text-center font-mono text-[13px] tracking-[0.04em] text-ink-soft">
              Ref {groupedCode(ticket.ticketCode)}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

const pastStatus: Record<Extract<TicketState, "ended" | "cancelled">, string> = {
  ended: "Not checked in",
  cancelled: "Event cancelled",
};

/** A past or cancelled ticket: one line, no QR. */
export function PastTicketRow({
  ticket,
  state,
}: {
  ticket: TicketStubData;
  state: Extract<TicketState, "ended" | "cancelled">;
}) {
  return (
    <li
      id={`ticket-${ticket.registrationId}`}
      className="flex scroll-mt-24 items-center gap-3 border-b border-line py-3.5 last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-semibold tracking-[-0.01em] break-words",
            state === "cancelled" ? "text-ink-soft line-through" : "text-ink",
          )}
        >
          {ticket.eventTitle}
        </p>
        <p className="text-[13.5px] text-ink-soft">
          {ticket.clubName} · {formatIstShortDate(ticket.eventStartAt)}
        </p>
      </div>
      {ticket.checkedInAt ? (
        <span className="flex shrink-0 items-center gap-1 text-right text-[13px] font-semibold text-success">
          <Icon name="check" strokeWidth={2.4} />
          {isSameIstDay(ticket.checkedInAt, ticket.eventStartAt)
            ? `Checked in ${formatIstTime(ticket.checkedInAt)}`
            : `Checked in ${formatIstShortDate(ticket.checkedInAt)}`}
        </span>
      ) : (
        <span
          className={cn(
            "shrink-0 text-right text-[13px] font-medium",
            state === "cancelled" ? "text-danger" : "text-ink-soft",
          )}
        >
          {pastStatus[state]}
        </span>
      )}
    </li>
  );
}
