import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VerifiedBadge } from "@/components/clubs/VerifiedBadge";
import { RegisterCTA, type RegisterCTAState } from "@/components/events/RegisterCTA";
import { registerForEvent } from "./actions";

async function getEvent(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select(
      "id, title, slug, description, banner_url, venue, start_at, end_at, registration_deadline, capacity, status, club:clubs(name, slug, verified)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  return data as unknown as
    | {
        id: string;
        title: string;
        slug: string;
        description: string | null;
        banner_url: string | null;
        venue: string | null;
        start_at: string;
        end_at: string;
        registration_deadline: string | null;
        capacity: number | null;
        status: string;
        club: { name: string; slug: string; verified: boolean } | null;
      }
    | null;
}

// Computes the CTA's initial render state server-side so the page never
// flashes "Register" before flipping to "Registered"/"Full"/etc. Only
// "closed" (deadline passed) and "full" (capacity reached) are reachable
// this way — getEvent only ever returns published events, so "cancelled"
// isn't reachable from a page load; RegisterCTA still supports it for the
// rare race where an event is cancelled between page load and the click.
async function getInitialCTAState(event: {
  id: string;
  registration_deadline: string | null;
  capacity: number | null;
}): Promise<{ state: RegisterCTAState; ticketCode: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: existing } = await supabase
      .from("event_registrations")
      .select("ticket_code")
      .eq("event_id", event.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return { state: "registered", ticketCode: existing.ticket_code };
    }
  }

  if (
    event.registration_deadline &&
    new Date() > new Date(event.registration_deadline)
  ) {
    return { state: "closed", ticketCode: null };
  }

  if (event.capacity != null) {
    const { data: count } = await supabase.rpc(
      "get_event_registration_count",
      { target_event: event.id },
    );
    if (count != null && count >= event.capacity) {
      return { state: "full", ticketCode: null };
    }
  }

  if (!user) {
    return { state: "login_required", ticketCode: null };
  }

  return { state: "idle", ticketCode: null };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);

  if (!event) {
    return { title: "Event not found — Sabha" };
  }

  const title = `${event.title} — Sabha`;
  const description =
    event.description?.slice(0, 200) ??
    `${event.club?.name ?? "A DTU society"} event on Sabha.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: event.banner_url ? [{ url: event.banner_url }] : undefined,
    },
    twitter: {
      card: event.banner_url ? "summary_large_image" : "summary",
      title,
      description,
      images: event.banner_url ? [event.banner_url] : undefined,
    },
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEvent(slug);

  if (!event) notFound();

  const { state: ctaState, ticketCode } = await getInitialCTAState(event);

  const start = new Date(event.start_at);
  const end = new Date(event.end_at);

  return (
    <main className="mx-auto max-w-2xl flex-1 px-6 py-12">
      {event.banner_url && (
        <div className="aspect-[16/9] w-full overflow-hidden rounded-2xl border border-line bg-ink/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.banner_url}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-ink-soft">
        {event.club && (
          <a href={`/clubs/${event.club.slug}`} className="hover:text-ink">
            {event.club.name}
          </a>
        )}
        {event.club?.verified && <VerifiedBadge />}
      </div>

      <h1 className="mt-2 font-display text-3xl font-bold text-ink">
        {event.title}
      </h1>

      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-mono text-xs uppercase tracking-wide text-ink-soft">
            Date &amp; time
          </dt>
          <dd className="mt-0.5 text-ink">
            {start.toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            {" – "}
            {end.toLocaleString("en-IN", { timeStyle: "short" })}
          </dd>
        </div>
        {event.venue && (
          <div>
            <dt className="font-mono text-xs uppercase tracking-wide text-ink-soft">
              Venue
            </dt>
            <dd className="mt-0.5 text-ink">{event.venue}</dd>
          </div>
        )}
        {event.registration_deadline && (
          <div>
            <dt className="font-mono text-xs uppercase tracking-wide text-ink-soft">
              Registration closes
            </dt>
            <dd className="mt-0.5 text-ink">
              {new Date(event.registration_deadline).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </dd>
          </div>
        )}
        {event.capacity != null && (
          <div>
            <dt className="font-mono text-xs uppercase tracking-wide text-ink-soft">
              Capacity
            </dt>
            <dd className="mt-0.5 text-ink">{event.capacity} spots</dd>
          </div>
        )}
      </dl>

      {event.description && (
        <p className="mt-6 whitespace-pre-wrap text-ink-soft">
          {event.description}
        </p>
      )}

      <div className="mt-8">
        <RegisterCTA
          initialState={ctaState}
          initialTicketCode={ticketCode}
          registerAction={registerForEvent.bind(null, event.id, event.slug)}
        />
      </div>
    </main>
  );
}
