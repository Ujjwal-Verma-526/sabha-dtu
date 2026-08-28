import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EventCard, type EventCardData } from "@/components/events/EventCard";
import { cn } from "@/lib/utils";

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

  // Public feed: only published events belonging to a verified club — the
  // clubs!inner join plus the club.verified filter keeps an unverified
  // club's events out of the public feed, same as /clubs already does for
  // the club directory itself.
  let query = supabase
    .from("events")
    .select(
      "id, title, slug, banner_url, venue, start_at, capacity, club:clubs!inner(name, slug, verified, category)",
    )
    .eq("status", "published")
    .eq("club.verified", true)
    .gte("start_at", new Date().toISOString())
    .order("start_at");

  if (club) {
    query = query.eq("club.slug", club);
  }
  if (category) {
    query = query.eq("club.category", category);
  }
  if (date) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59.999`);
    if (!Number.isNaN(start.getTime())) {
      query = query.gte("start_at", start.toISOString()).lte("start_at", end.toISOString());
    }
  }

  const [{ data: events }, { data: clubOptions }] = await Promise.all([
    query,
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
        Upcoming, published events from verified DTU societies.
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

      {items.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((event) => (
            <EventCard key={event.slug} event={event} />
          ))}
        </div>
      ) : (
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
      )}
    </main>
  );
}
