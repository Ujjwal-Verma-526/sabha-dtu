import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { eventWhenWhere } from "@/lib/event-share";
import { isHappeningNow } from "@/lib/event-timing";
import { istRelativeDay } from "@/lib/ist";
import type { NextTicket } from "@/lib/viewer-registrations";

/**
 * The /events sidebar's "Your next ticket": the signed-in viewer's soonest
 * registered event that hasn't ended. A shortcut to /tickets; the QR itself
 * stays there.
 */
export function NextTicketCard({ ticket, now }: { ticket: NextTicket; now: Date }) {
  const live = isHappeningNow({ start_at: ticket.startAt, end_at: ticket.endAt }, now);
  const note = live ? "Happening now" : istRelativeDay(ticket.startAt, now);

  return (
    <section
      aria-labelledby="next-ticket"
      className="rounded-2xl border border-line bg-surface p-5 shadow-card"
    >
      <h2 id="next-ticket" className="text-[12.5px] font-bold tracking-[0.08em] text-ink-soft uppercase">
        Your next ticket
      </h2>
      <Link
        href={`/events/${ticket.slug}`}
        className="mt-2 block font-semibold tracking-[-0.015em] text-ink hover:text-primary"
      >
        {ticket.title}
      </Link>
      <p className="mt-1 text-[13.5px] text-ink-soft">
        {eventWhenWhere({ start_at: ticket.startAt, end_at: ticket.endAt, venue: ticket.venue })}
      </p>
      <p className="mt-0.5 text-[13.5px] text-ink-soft">{ticket.clubName}</p>
      {note && (
        <p
          className={
            live
              ? "mt-2 text-[13.5px] font-semibold text-live-text"
              : "mt-2 text-[13.5px] font-semibold text-ink"
          }
        >
          {note}
        </p>
      )}
      <ButtonLink href={`/tickets#ticket-${ticket.registrationId}`} className="mt-4 w-full">
        Open ticket
      </ButtonLink>
    </section>
  );
}
