import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader, sectionHeadingClass } from "@/components/ui/PageHeader";
import { PastTicketRow, TicketStub } from "@/components/tickets/TicketStub";
import { loginPathFor } from "@/lib/auth-redirect";
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
    redirect(loginPathFor("/tickets"));
  }

  // Event details come from get_my_registrations() (security definer,
  // scoped to auth.uid()) because events RLS hides cancelled/completed
  // events from students. It never returns tokens. The name printed on the
  // tickets (and the photo beside it) is the viewer's own users row, under its
  // own-row RLS.
  const [registrationsResult, profileResult] = await Promise.all([
    supabase.rpc("get_my_registrations"),
    supabase.from("users").select("name, avatar_url").eq("id", user.id).maybeSingle(),
  ]);
  const { data: registrations, error: registrationsError } = registrationsResult;

  if (registrationsError) {
    throw new Error(`Could not load your tickets: ${registrationsError.message}`);
  }
  if (profileResult.error) {
    // The name is a courtesy for the door team; the QR works without it.
    console.error("Could not load the ticket holder's name", profileResult.error.message);
  }
  const attendeeName = profileResult.data?.name ?? null;
  const attendeeAvatarUrl = profileResult.data?.avatar_url ?? null;

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
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 md:px-8 md:pt-11">
      <PageHeader title="My tickets" description="One QR per event. Open it at the door." />

      {tickets.length === 0 ? (
        <EmptyState
          icon="ticket"
          title="No tickets yet"
          className="mt-8"
          action={<ButtonLink href="/events">Browse events</ButtonLink>}
        >
          Register for an event and its ticket shows up here.
        </EmptyState>
      ) : (
        <div className="mt-6 md:mt-8 md:grid md:grid-cols-[420px_minmax(0,1fr)] md:items-start md:gap-14">
          <section aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading" className={sectionHeadingClass}>
              Upcoming · {current.length}
            </h2>
            {current.length === 0 ? (
              <EmptyState
                title="Nothing coming up"
                className="mt-3"
                action={
                  <ButtonLink href="/events" variant="soft">
                    Find an event
                  </ButtonLink>
                }
              >
                Register for an event and its QR shows up here.
              </EmptyState>
            ) : (
              <div className="mt-3 flex flex-col gap-6">
                {current.map(({ registration, state }) => (
                  <TicketStub
                    key={registration.registration_id}
                    state={state === "on_hold" ? "on_hold" : "active"}
                    qrSvg={qrByRegistration.get(registration.registration_id) ?? null}
                    ticket={toStubData(registration)}
                    attendeeName={attendeeName}
                    attendeeAvatarUrl={attendeeAvatarUrl}
                    attendeeUserId={user.id}
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="past-heading" className="mt-10 md:mt-0">
            <h2 id="past-heading" className={sectionHeadingClass}>
              Past &amp; cancelled · {past.length}
            </h2>
            {past.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">
                Events you&apos;ve been to, and any that were cancelled, are listed here.
              </p>
            ) : (
              <ul className="mt-1">
                {past.map(({ registration, state }) => (
                  <PastTicketRow
                    key={registration.registration_id}
                    state={state === "cancelled" ? "cancelled" : "ended"}
                    ticket={toStubData(registration)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
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
  event_end_at: string;
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
    eventEndAt: registration.event_end_at,
    clubName: registration.club_name,
  };
}
