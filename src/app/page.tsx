import Link from "next/link";
import { DateNumeral } from "@/components/events/DateNumeral";
import { EventPoster } from "@/components/events/EventPoster";
import type { EventListData } from "@/components/events/EventListItems";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { categoryKey } from "@/lib/categories";
import { happeningNowEndFloor, publicEventFeed } from "@/lib/event-feed";
import { isHappeningNow } from "@/lib/event-timing";
import { formatIstShortDate, formatIstTime, istWeekEnd } from "@/lib/ist";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";

/** Below this many events this week, the big numbers would look thin; lead with the posters instead. */
const MIN_EVENTS_FOR_NUMBERS = 3;
const POSTER_COUNT = 4;

const steps = [
  {
    title: "Admin creates the event",
    body: "Name, venue, capacity, registration deadline. Takes a couple of minutes.",
  },
  {
    title: "It goes public",
    body: "Live on Sabha immediately — anyone can find it, no login needed.",
  },
  {
    title: "Student registers",
    body: "One tap once they're signed in. No forms to re-fill.",
  },
  {
    title: "QR ticket is issued",
    body: "Unique per registration, lands straight in their account.",
  },
  {
    title: "Scanned at the door",
    body: "Admin scans it on check-in. Registration flips to checked-in, instantly.",
  },
];

const softButtonClass =
  "mt-4 inline-flex min-h-11 items-center rounded-xl bg-soft px-4 text-[15px] font-semibold text-ink hover:bg-line";

export default async function Home() {
  // Signed-in visitors never get here: src/proxy.ts sends them to /events.
  const supabase = await createClient();
  const now = new Date();

  // The same public feed /events reads (published, verified clubs), cut
  // three ways: the next few posters, the rest of this IST week, and
  // what's running right now.
  const [{ data: nextEvents }, { data: weekEvents }, { data: liveEvents }] =
    await Promise.all([
      publicEventFeed(supabase).gte("start_at", now.toISOString()).limit(POSTER_COUNT),
      publicEventFeed(supabase)
        .gte("start_at", now.toISOString())
        .lt("start_at", istWeekEnd(now).toISOString()),
      publicEventFeed(supabase)
        .lte("start_at", now.toISOString())
        .gte("end_at", happeningNowEndFloor(now)),
    ]);

  const posters = (nextEvents ?? []) as unknown as EventListData[];
  const happeningNow = ((liveEvents ?? []) as unknown as EventListData[]).filter((event) =>
    isHappeningNow(event, now),
  );
  // "This week" = running now plus starting before Sunday night, IST.
  const thisWeek = new Map<string, EventListData>();
  for (const event of [...happeningNow, ...((weekEvents ?? []) as unknown as EventListData[])]) {
    thisWeek.set(event.slug, event);
  }
  const societies = new Set([...thisWeek.values()].map((event) => event.club.slug)).size;

  const showNumbers = thisWeek.size >= MIN_EVENTS_FOR_NUMBERS;
  const stats = [
    { value: thisWeek.size, label: "events this week", live: false },
    {
      value: societies,
      label: societies === 1 ? "society posting this week" : "societies posting this week",
      live: false,
    },
    ...(happeningNow.length > 0
      ? [{ value: happeningNow.length, label: "happening right now", live: true }]
      : []),
  ];

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="hero-dots relative overflow-hidden border-b border-line">
        <PinnedPosters />
        <div className="relative mx-auto max-w-6xl px-4 pt-8 pb-12 md:px-8 md:pt-16 md:pb-20">
          <Logo variant="full" size={64} className="mb-6 md:mb-8" />
          <p className="text-[12.5px] font-bold tracking-[0.1em] text-marigold-text uppercase">
            {formatIstShortDate(now)} · This week at DTU
          </p>

          {showNumbers && (
            <ul
              aria-label="This week at DTU"
              className="mt-5 grid grid-cols-3 gap-x-4 border-b-2 border-ink pb-6 md:mt-8 md:flex md:flex-wrap md:items-end md:gap-x-14 md:pb-7"
            >
              {stats.map((stat) => (
                <li key={stat.label}>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "font-display-tight block text-[68px] leading-[0.85] tabular-nums md:text-[136px] lg:text-[168px]",
                      stat.live ? "text-live-text" : "text-ink",
                    )}
                  >
                    {String(stat.value).padStart(2, "0")}
                  </span>
                  <span className="mt-2 block text-[13.5px] leading-snug text-ink-soft md:mt-3 md:text-[15px]">
                    <span className="sr-only">{stat.value} </span>
                    {stat.label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div
            className={cn(
              "flex flex-col gap-6",
              // With the numbers, the buttons sit beside the headline; without
              // them the headline leads and the buttons follow it.
              showNumbers
                ? "mt-7 md:mt-10 md:flex-row md:items-end md:justify-between md:gap-10"
                : "mt-3 md:mt-4 md:gap-8",
            )}
          >
            <div className="max-w-2xl">
              <h1
                className={cn(
                  "font-display-tight leading-[0.98] text-balance text-ink",
                  showNumbers ? "text-[40px] md:text-[60px]" : "text-[44px] md:text-[84px]",
                )}
              >
                DTU&rsquo;s events, finally in one place.
              </h1>
              <p className="mt-3 max-w-[32em] text-[17px] text-pretty text-ink-soft md:mt-4 md:text-lg">
                Every society posts here. You register in a tap and walk in with a QR ticket.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <ButtonLink href="/events">
                Browse events
                <Icon name="arrowRight" />
              </ButtonLink>
              <ButtonLink href="#for-societies" variant="ghost">
                For societies
              </ButtonLink>
            </div>
          </div>

          {posters.length > 0 ? (
            <section aria-labelledby="coming-up" className="mt-10 md:mt-14">
              <div className="flex items-baseline justify-between gap-4">
                <h2
                  id="coming-up"
                  className="text-[12.5px] font-bold tracking-[0.1em] text-ink-soft uppercase"
                >
                  Coming up
                </h2>
                <Link
                  href="/events"
                  className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline"
                >
                  See all events
                </Link>
              </div>
              <ul className="-mx-4 mt-2 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:mt-3 md:grid md:grid-cols-4 md:gap-5 md:overflow-visible md:px-0 md:pb-0">
                {posters.map((event) => (
                  <li key={event.slug} className="w-[44%] shrink-0 snap-start md:w-auto">
                    <PosterCard event={event} />
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div className="mt-10 rounded-2xl border border-dashed border-control bg-paper px-6 py-10 text-center md:mt-14">
              <Icon name="calendar" className="mx-auto text-[28px] text-ink-soft" />
              <p className="mt-3 text-lg font-semibold text-ink">
                {happeningNow.length > 0 ? "Nothing else coming up yet" : "Nothing on the calendar yet"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
                {happeningNow.length > 0
                  ? "Something's on right now, though. New events show up here as societies publish them."
                  : "When DTU societies publish events, they show up here, soonest first."}
              </p>
              {happeningNow.length > 0 ? (
                <Link href="/events" className={softButtonClass}>
                  See what&apos;s on
                </Link>
              ) : (
                <Link href="/clubs" className={softButtonClass}>
                  Browse societies
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <h2 className="font-display-tight text-[34px] leading-none text-ink md:text-[48px]">
          Five steps, one scan
        </h2>
        <p className="mt-3 max-w-lg text-ink-soft">
          No spreadsheets, no guest lists printed at midnight. The whole loop lives in one place.
        </p>

        <ol className="mt-8 grid gap-3 sm:grid-cols-2 md:mt-10 md:gap-4 lg:grid-cols-5">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Card className="flex h-full gap-4 p-5 sm:flex-col sm:gap-2">
                <span
                  aria-hidden="true"
                  className="font-display-tight w-12 shrink-0 text-[40px] leading-[0.85] tabular-nums text-ink-soft sm:w-auto"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="sm:mt-2">
                  <h3 className="text-base font-semibold tracking-[-0.015em] text-ink">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-ink-soft sm:mt-2">{step.body}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* For societies / students */}
      <section
        id="for-societies"
        className="mx-auto max-w-6xl scroll-mt-16 px-4 pb-16 md:scroll-mt-20 md:px-8 md:pb-24"
      >
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          <div className="flex flex-col rounded-2xl bg-ink p-6 text-paper md:p-8">
            <h2 className="font-display-tight text-[30px] leading-none md:text-[38px]">
              For societies
            </h2>
            <ul className="mt-5 space-y-3 text-[15px] text-paper/80">
              <li>Publish an event and take registrations same-day.</li>
              <li>Watch registrations come in, live, no export needed.</li>
              <li>Scan tickets at the door — no manual list-checking.</li>
              <li>Know exactly who showed up, not just who signed up.</li>
            </ul>
            <div className="mt-auto pt-6">
              <Link
                href="/clubs"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-paper px-4 text-[15px] font-semibold text-ink hover:opacity-90"
              >
                Find your society
                <Icon name="arrowRight" />
              </Link>
            </div>
          </div>
          <Card className="md:p-8">
            <h2 className="font-display-tight text-[30px] leading-none text-ink md:text-[38px]">
              For students
            </h2>
            <ul className="mt-5 space-y-3 text-[15px] text-ink-soft">
              <li>Every society&apos;s events, one place to check.</li>
              <li>Only real DTU societies, so it&apos;s not full of dead listings.</li>
              <li>Your ticket lives in your account — nothing to lose.</li>
              <li>Register once, walk in on a scan, no queue for names.</li>
            </ul>
          </Card>
        </div>
      </section>
    </main>
  );
}

/** One upcoming event: its poster with the date pinned on, then the title. */
function PosterCard({ event }: { event: EventListData }) {
  return (
    <Link href={`/events/${event.slug}`} className="group block">
      <div className="relative">
        <EventPoster
          title={event.title}
          clubName={event.club.name}
          bannerUrl={event.banner_url}
          category={categoryKey(event.category)}
          size="card"
          className="aspect-[4/5] w-full rounded-2xl shadow-card"
        />
        <DateNumeral
          instant={event.start_at}
          className="absolute top-2 left-2 flex-col items-start gap-1 rounded-xl bg-paper px-2.5 pt-2 pb-1.5 shadow-card md:top-3 md:left-3"
          numeralClassName="text-[34px] md:text-[44px]"
        />
      </div>
      <p className="mt-2.5 truncate text-[13px] text-ink-soft">
        {formatIstTime(event.start_at)} · {event.club.name}
      </p>
      <h3 className="mt-0.5 line-clamp-2 text-[15px] leading-snug font-semibold tracking-[-0.015em] text-ink group-hover:text-primary md:text-base">
        {event.title}
      </h3>
    </Link>
  );
}

/**
 * Outlined, tilted "pinned posters" behind the hero. Decoration only; from
 * md up, since on a phone they would cross the numbers and their labels.
 */
function PinnedPosters() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 620 520"
      className="pointer-events-none absolute top-6 -right-16 hidden w-[620px] fill-none stroke-hero-decor md:block"
      strokeWidth={2}
    >
      <g transform="rotate(-8 190 170)">
        <rect x="110" y="60" width="170" height="220" rx="14" />
        <line x1="130" y1="230" x2="240" y2="230" />
        <line x1="130" y1="250" x2="200" y2="250" />
        <circle cx="195" cy="60" r="7" stroke="none" style={{ fill: "var(--swash)" }} />
      </g>
      <g transform="rotate(6 400 230)">
        <rect x="320" y="110" width="180" height="240" rx="14" />
        <text
          x="340"
          y="190"
          stroke="none"
          className="fill-hero-decor font-display"
          fontWeight={800}
          fontSize={64}
        >
          17
        </text>
        <line x1="340" y1="300" x2="470" y2="300" />
        <circle cx="410" cy="110" r="7" stroke="none" style={{ fill: "var(--cat-technical)" }} />
      </g>
      <g transform="rotate(-4 250 400)">
        <rect x="180" y="330" width="200" height="150" rx="14" strokeDasharray="6 8" />
        <circle cx="280" cy="330" r="7" stroke="none" style={{ fill: "var(--cat-social)" }} />
      </g>
    </svg>
  );
}
