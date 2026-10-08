import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { TicketStub } from "@/components/tickets/TicketStub";
import { renderTicketQrSvg } from "@/lib/qr";
import { getTicketState, type TicketState } from "@/lib/tickets";

export const metadata: Metadata = {
  title: "My tickets — Sabha",
  // Personal page holding entry QRs: keep it out of search indexes.
  robots: { index: false, follow: false },
};

export default async function TicketsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Event details come from get_my_registrations() (security definer,
  // scoped to auth.uid()) because events RLS hides cancelled/completed
  // events from students. It never returns tokens.
  const { data: registrations, error: registrationsError } =
    await supabase.rpc("get_my_registrations");

  if (registrationsError) {
    throw new Error(`Could not load your tickets: ${registrationsError.message}`);
  }

  const now = new Date();
  const tickets = registrations.map((registration) => ({
    registration,
    state: getTicketState(
      registration.event_status,
      registration.event_start_at,
      registration.event_end_at,
      now,
    ),
  }));

  // Tokens are read only for tickets that will actually show a QR, and only
  // through registration_tickets' own RLS (registrant-only SELECT).
  const activeIds = tickets
    .filter((ticket) => ticket.state === "active")
    .map((ticket) => ticket.registration.registration_id);

  const tokenByRegistration = new Map<string, string>();
  if (activeIds.length > 0) {
    const { data: tokenRows, error: tokensError } = await supabase
      .from("registration_tickets")
      .select("registration_id, token")
      .in("registration_id", activeIds);

    if (tokensError) {
      throw new Error(`Could not load your ticket codes: ${tokensError.message}`);
    }
    for (const row of tokenRows) {
      tokenByRegistration.set(row.registration_id, row.token);
    }
  }

  const qrByRegistration = new Map<string, string>();
  await Promise.all(
    [...tokenByRegistration].map(async ([registrationId, token]) => {
      qrByRegistration.set(registrationId, await renderTicketQrSvg(token));
    }),
  );

  const isCurrent = (state: TicketState) => state === "active" || state === "on_hold";
  // get_my_registrations() already orders by start time (soonest first);
  // past and cancelled tickets read better most-recent first.
  const current = tickets.filter((ticket) => isCurrent(ticket.state));
  const past = tickets.filter((ticket) => !isCurrent(ticket.state)).reverse();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <h1 className="font-display text-3xl font-bold text-ink">My tickets</h1>
      <p className="mt-2 text-ink-soft">
        One QR per event. Open this page at the entrance and show the code.
      </p>

      {tickets.length === 0 ? (
        <Card className="mt-8 text-center">
          <p className="font-display text-lg font-semibold text-ink">No tickets yet</p>
          <p className="mt-1 text-sm text-ink-soft">
            Register for an event and its ticket will appear here.
          </p>
          <ButtonLink href="/events" variant="primary" className="mt-5">
            Browse events
          </ButtonLink>
        </Card>
      ) : (
        <>
          <section className="mt-10" aria-labelledby="upcoming-heading">
            <h2
              id="upcoming-heading"
              className="font-mono text-xs uppercase tracking-widest text-ink-soft"
            >
              Upcoming · {current.length}
            </h2>
            {current.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">
                Nothing coming up.{" "}
                <Link href="/events" className="font-medium text-primary hover:underline">
                  Find an event
                </Link>
                .
              </p>
            ) : (
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                {current.map(({ registration, state }) => (
                  <TicketStub
                    key={registration.registration_id}
                    state={state}
                    qrSvg={qrByRegistration.get(registration.registration_id) ?? null}
                    ticket={toStubData(registration)}
                  />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="mt-14" aria-labelledby="past-heading">
              <h2
                id="past-heading"
                className="font-mono text-xs uppercase tracking-widest text-ink-soft"
              >
                Past &amp; cancelled · {past.length}
              </h2>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                {past.map(({ registration, state }) => (
                  <TicketStub
                    key={registration.registration_id}
                    state={state}
                    qrSvg={null}
                    ticket={toStubData(registration)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function toStubData(registration: {
  registration_id: string;
  ticket_code: string;
  checked_in_at: string | null;
  event_title: string;
  event_slug: string;
  event_venue: string | null;
  event_start_at: string;
  club_name: string;
}) {
  return {
    registrationId: registration.registration_id,
    ticketCode: registration.ticket_code,
    checkedInAt: registration.checked_in_at,
    eventTitle: registration.event_title,
    eventSlug: registration.event_slug,
    eventVenue: registration.event_venue,
    eventStartAt: registration.event_start_at,
    clubName: registration.club_name,
  };
}
