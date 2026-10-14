import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DateNumeral } from "@/components/events/DateNumeral";
import { CategoryDot } from "@/components/events/EventPoster";
import { EventRow, LiveBanner, type EventListData } from "@/components/events/EventListItems";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { fieldClass } from "@/components/ui/Input";
import { categoryKey } from "@/lib/categories";
import { isHappeningNow } from "@/lib/event-timing";
import {
  formatIstShortDate,
  istDayKey,
  istDayRange,
  istDaysBetween,
  istRelativeDay,
} from "@/lib/ist";
import { EVENT_END_FALLBACK_HOURS } from "@/lib/tickets";
import { cn } from "@/lib/utils";

const HOUR_MS = 60 * 60 * 1000;

export const metadata = {
  title: "Events — Sabha",
  description: "Upcoming DTU society events, all in one place.",
};

/** Days since this IST week's Monday (0 = Monday). */
function istWeekday(instant: Date | string) {
  return (new Date(`${istDayKey(instant)}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** "This week", "Next week" or "Later", by IST calendar weeks starting Monday. */
function weekLabel(instant: string, now: Date) {
  const weeks = Math.floor((istDaysBetween(now, instant) + istWeekday(now)) / 7);
  return weeks <= 0 ? "This week" : weeks === 1 ? "Next week" : "Later";
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

const softButtonClass =
  "mt-4 inline-flex min-h-11 items-center rounded-xl bg-soft px-4 text-[15px] font-semibold text-ink hover:bg-line";

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

  const items = (events ?? []) as unknown as EventListData[];
  const happeningNow = (
    (liveEvents ?? []) as unknown as EventListData[]
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

  // Day groups (IST), each under its week heading.
  const days: { key: string; week: string; events: EventListData[] }[] = [];
  for (const event of items) {
    const key = istDayKey(event.start_at);
    const last = days.at(-1);
    if (last?.key === key) last.events.push(event);
    else days.push({ key, week: weekLabel(event.start_at, now), events: [event] });
  }

  const filtered = Boolean(club || category || date);
  const societies = new Set(items.map((event) => event.club.slug)).size;
  const summary = [
    items.length > 0
      ? `${plural(items.length, "upcoming event", "upcoming events")} from ${plural(societies, "society", "societies")}.`
      : "",
    happeningNow.length === 1
      ? "One is on right now."
      : happeningNow.length > 1
        ? `${happeningNow.length} are on right now.`
        : "",
  ]
    .join(" ")
    .trim();

  const chipClass = (on: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors",
      on ? "bg-ink text-paper" : "bg-soft text-ink hover:bg-line",
    );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 md:px-8 md:pt-11">
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_300px] md:gap-14">
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold tracking-[0.08em] text-live-text uppercase">
            {formatIstShortDate(now)} · what&apos;s on
          </p>
          <h1 className="font-display-tight mt-1.5 text-[42px] leading-[0.95] text-ink md:text-[68px]">
            What&apos;s on at{" "}
            <span className="swash">
              DTU
              <svg viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true">
                <path d="M2 11c18-6 40-8 60-6s26 4 36 2" />
              </svg>
            </span>
          </h1>
          <p className="mt-4 text-ink-soft">
            {summary || "Events from verified DTU societies, soonest first."}
          </p>

          {categories.length > 0 && (
            <div
              role="group"
              aria-label="Filter by category"
              className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
            >
              <Link
                href={filterLink({ category: undefined })}
                aria-current={!category ? "true" : undefined}
                className={chipClass(!category)}
              >
                All
              </Link>
              {categories.map((c) => (
                <Link
                  key={c}
                  href={filterLink({ category: c })}
                  aria-current={category === c ? "true" : undefined}
                  className={chipClass(category === c)}
                >
                  <CategoryDot category={categoryKey(c)} className="h-[9px] w-[9px]" />
                  {c}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-start gap-x-5">
            <details className="group" open={Boolean(club || date)}>
              <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg text-sm font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
                <Icon name="filter" />
                Date and society
                <Icon name="chevronDown" className="transition-transform group-open:rotate-180" />
              </summary>
              <form method="get" className="mt-2 mb-1 flex flex-wrap items-end gap-3">
                {category && <input type="hidden" name="category" value={category} />}
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-semibold text-ink">Date</span>
                  <input
                    type="date"
                    name="date"
                    defaultValue={date ?? ""}
                    className={cn(fieldClass, "min-h-11 py-2")}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-sm">
                  <span className="font-semibold text-ink">Society</span>
                  <select
                    name="club"
                    defaultValue={club ?? ""}
                    className={cn(fieldClass, "min-h-11 max-w-full py-2")}
                  >
                    <option value="">All societies</option>
                    {(clubOptions ?? []).map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="ghost">
                  Apply
                </Button>
              </form>
            </details>
            {filtered && (
              <Link
                href="/events"
                className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline"
              >
                Clear filters
              </Link>
            )}
          </div>

          {happeningNow.length > 0 && (
            <section aria-labelledby="happening-now" className="mt-5 md:mt-6">
              <h2 id="happening-now" className="sr-only">
                Happening now
              </h2>
              <div className="flex flex-col gap-3">
                {happeningNow.map((event) => (
                  <LiveBanner key={event.slug} event={event} />
                ))}
              </div>
            </section>
          )}

          {days.length > 0 ? (
            <>
              {days.map((day, index) => (
                <section key={day.key} aria-label={formatIstShortDate(day.events[0].start_at)}>
                  {day.week !== days[index - 1]?.week && (
                    <h2 className="font-display-tight mt-9 text-[27px] text-ink md:mt-12 md:text-[34px]">
                      {day.week}
                    </h2>
                  )}
                  <div className="mt-5 md:mt-6 md:grid md:grid-cols-[132px_minmax(0,1fr)] md:gap-6 md:border-t md:border-line md:pt-5">
                    <div className="flex items-end gap-2.5 border-b border-line pb-2.5 md:sticky md:top-24 md:block md:self-start md:border-0 md:pb-0">
                      <DateNumeral
                        instant={day.events[0].start_at}
                        className="md:flex-col md:items-start md:gap-2"
                        numeralClassName="md:text-[76px]"
                      />
                      <span className="ml-auto pb-px text-[13px] text-ink-soft md:mt-2 md:ml-0 md:block">
                        {istRelativeDay(day.events[0].start_at, now)}
                      </span>
                    </div>
                    <div>
                      {day.events.map((event) => (
                        <EventRow key={event.slug} event={event} />
                      ))}
                    </div>
                  </div>
                </section>
              ))}
              <p className="mt-7 text-[13.5px] text-ink-soft">
                That&apos;s everything published so far. Societies add events all week.
              </p>
            </>
          ) : (
            <div className="mt-8 rounded-2xl border border-dashed border-control px-6 py-10 text-center">
              <Icon name="calendar" className="mx-auto text-[28px] text-ink-soft" />
              <p className="mt-3 text-lg font-semibold text-ink">
                {filtered
                  ? "Nothing matches these filters"
                  : happeningNow.length > 0
                    ? "Nothing else coming up yet"
                    : "Nothing on yet"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
                {filtered
                  ? "Try another date or society, or clear the filters."
                  : "When DTU societies publish events, they show up here, soonest first."}
              </p>
              {filtered ? (
                <Link href="/events" className={softButtonClass}>
                  Clear filters
                </Link>
              ) : (
                <Link href="/clubs" className={softButtonClass}>
                  Browse societies
                </Link>
              )}
            </div>
          )}
        </div>

        <aside className="hidden md:sticky md:top-24 md:mt-11 md:block md:self-start">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <p className="font-semibold tracking-[-0.015em] text-ink">Running a society event?</p>
            <p className="mt-1.5 text-[13.5px] text-ink-soft">
              Society admins and coordinators publish from Manage, in the header. A title, a time
              and a venue is enough to go live.
            </p>
            <Link
              href="/clubs"
              className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-control text-[15px] font-semibold text-ink hover:border-ink"
            >
              Find your society
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
