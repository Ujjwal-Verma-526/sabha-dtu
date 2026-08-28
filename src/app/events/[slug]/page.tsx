import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VerifiedBadge } from "@/components/clubs/VerifiedBadge";
import { RegisterCTA } from "@/components/events/RegisterCTA";

async function getEvent(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select(
      "title, slug, description, banner_url, venue, start_at, end_at, registration_deadline, capacity, status, club:clubs(name, slug, verified)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  return data as unknown as
    | {
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
        <RegisterCTA />
      </div>
    </main>
  );
}
