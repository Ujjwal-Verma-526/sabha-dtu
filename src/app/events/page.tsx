import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EventCard, type EventCardData } from "@/components/events/EventCard";
import { isHappeningNow } from "@/lib/event-timing";
import { istDayRange } from "@/lib/ist";
import { EVENT_END_FALLBACK_HOURS } from "@/lib/tickets";
import { cn } from "@/lib/utils";

const HOUR_MS = 60 * 60 * 1000;

export const metadata = {
  title: "Events — Sabha",
  description: "Upcoming DTU society events, all in one place.",
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string; category?: string; date?: string }>;
}) {
  const { club, category, date } = await searchParams;

  const supabase = await createClient();
  const now = new Date();

  // Public feed: only published events belonging to a verified club — the
  // clubs!inner join plus the club.verified filter keeps an unverified
  // club's events out of the public feed, same as /clubs already does for
  // the club directory itself. "Upcoming" and "Happening now" are the same
  // feed split at the start time, so they share these filters.
  function publicFeed() {
    let feed = supabase
      .from("events")
      .select(
        "id, title, slug, banner_url, venue, start_at, end_at, capacity, club:clubs!inner(name, slug, verified, category)",
      )
      .eq("status", "published")
      .eq("club.verified", true)
      .order("start_at");

    if (club) {
      feed = feed.eq("club.slug", club);
    }
    if (category) {
      feed = feed.eq("club.category", category);
    }
    if (date) {
      // The picked date is an IST calendar day, whatever the server's zone.
      const day = istDayRange(date);
      if (day) {
        feed = feed
          .gte("start_at", day.start.toISOString())
          .lt("start_at", day.nextDayStart.toISOString());
      }
    }
    return feed;
  }

  const upcomingQuery = publicFeed().gte("start_at", now.toISOString());

  // Started and not over. end_at >= now - fallback is a superset (an event
  // with end_at = start_at counts as running for EVENT_END_FALLBACK_HOURS);
  // isHappeningNow below applies the exact effective-end rule, the same one
  // tickets and door check-in use.
  const happeningNowQuery = publicFeed()
    .lte("start_at", now.toISOString())
    .gte(
      "end_at",
      new Date(now.getTime() - EVENT_END_FALLBACK_HOURS * HOUR_MS).toISOString(),
    );

  const [{ data: events }, { data: liveEvents }, { data: clubOptions }] =
    await Promise.all([
      upcomingQuery,
      happeningNowQuery,
      supabase
        .from("clubs")
        .select("slug, name, category")
        .eq("verified", true)
        .order("name"),
    ]);

  const categories = Array.from(
    new Set((clubOptions ?? []).map((c) => c.category).filter(Boolean)),
  ) as string[];

  const items = (events ?? []) as unknown as EventCardData[];
  const happeningNow = (
    (liveEvents ?? []) as unknown as (EventCardData & { end_at: string })[]
  ).filter((event) => isHappeningNow(event, now));

  function filterLink(overrides: Partial<{ club: string; category: string; date: string }>) {
    const params = new URLSearchParams();
    const next = { club, category, date, ...overrides };
    if (next.club) params.set("club", next.club);
    if (next.category) params.set("category", next.category);
    if (next.date) params.set("date", next.date);
    const qs = params.toString();
    return qs ? `/events?${qs}` : "/events";
  }

  return (
    <main className="mx-auto max-w-6xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl font-bold text-ink">Events</h1>
      <p className="mt-2 text-ink-soft">
        Published events from verified DTU societies, live and upcoming.
      </p>

      <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
        {category && <input type="hidden" name="category" value={category} />}
        {club && <input type="hidden" name="club" value={club} />}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Date</span>
          <input
            type="date"
            name="date"
            defaultValue={date ?? ""}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Society</span>
          <select
            name="club"
            defaultValue={club ?? ""}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
          >
            <option value="">All societies</option>
            {(clubOptions ?? []).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-primary"
        >
          Filter
        </button>
        {(club || category || date) && (
          <Link
            href="/events"
            className="text-sm text-ink-soft hover:text-ink"
          >
            Clear filters
          </Link>
        )}
      </form>

      {categories.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={filterLink({ category: undefined })}
            className={cn(
              "rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wide",
              !category
                ? "border-primary bg-primary/10 text-primary"
                : "border-line text-ink-soft hover:border-primary",
            )}
          >
            All categories
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={filterLink({ category: c })}
              className={cn(
                "rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wide",
                category === c
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-line text-ink-soft hover:border-primary",
              )}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      {happeningNow.length > 0 && (
        <section aria-labelledby="happening-now" className="mt-8">
          <h2
            id="happening-now"
            className="flex items-center gap-2 font-display text-xl font-semibold text-ink"
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
            Happening now
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {happeningNow.map((event) => (
              <EventCard key={event.slug} event={event} live />
            ))}
          </div>
        </section>
      )}

      {items.length > 0 ? (
        <section aria-labelledby="upcoming" className="mt-8">
          {happeningNow.length > 0 && (
            <h2
              id="upcoming"
              className="font-display text-xl font-semibold text-ink"
            >
              Upcoming
            </h2>
          )}
          <div
            className={cn(
              "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
              happeningNow.length > 0 && "mt-4",
            )}
          >
            {items.map((event) => (
              <EventCard key={event.slug} event={event} />
            ))}
          </div>
        </section>
      ) : happeningNow.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <p className="font-display text-lg font-semibold text-ink">
            No events match yet.
          </p>
          <p className="max-w-sm text-sm text-ink-soft">
            {club || category || date
              ? "Try a different filter or clear it."
              : "Published events from DTU societies will show up here."}
          </p>
        </div>
      ) : (
        <p className="mt-10 text-sm text-ink-soft">
          {club || category || date
            ? "No upcoming events match these filters."
            : "No upcoming events right now."}
        </p>
      )}
    </main>
  );
}
