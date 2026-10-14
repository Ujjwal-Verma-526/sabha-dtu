import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VerifiedBadge } from "@/components/clubs/VerifiedBadge";
import { clubMonogram } from "@/components/clubs/ClubLogo";
import { DateNumeral } from "@/components/events/DateNumeral";
import { CategoryDot, EventPoster } from "@/components/events/EventPoster";
import { RegisterCTA, type RegisterCTAState } from "@/components/events/RegisterCTA";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  categoryColor,
  categoryInk,
  categoryKey,
  categoryLabel,
  type CategoryKey,
} from "@/lib/categories";
import {
  isHappeningNow,
  isRegistrationClosed,
  registrationClosesAt,
} from "@/lib/event-timing";
import {
  istDayParts,
  formatIstShortDate,
  formatIstTime,
  isSameIstDay,
  istRelativeDay,
} from "@/lib/ist";
import { canManageClub, getViewerRoles } from "@/lib/roles";
import { effectiveEventEnd } from "@/lib/tickets";
import { registerForEvent } from "./actions";

async function getEvent(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select(
      "id, title, slug, category, description, banner_url, venue, start_at, end_at, registration_deadline, capacity, status, club:clubs(id, name, slug, verified, category)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  return data as unknown as
    | {
        id: string;
        title: string;
        slug: string;
        category: string;
        description: string | null;
        banner_url: string | null;
        venue: string | null;
        start_at: string;
        end_at: string;
        registration_deadline: string | null;
        capacity: number | null;
        status: string;
        club: {
          id: string;
          name: string;
          slug: string;
          verified: boolean;
          category: string | null;
        } | null;
      }
    | null;
}

// Aggregate-only, callable by anyone (get_event_registration_count); null
// if it fails, which the page treats as "unknown".
async function getRegistrationCount(eventId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data: count } = await supabase.rpc("get_event_registration_count", {
    target_event: eventId,
  });
  return count ?? null;
}

// Computes the CTA's initial render state server-side so the page never
// flashes "Register" before flipping to "Registered"/"Full"/etc. Only
// "closed" (registration closed) and "full" (capacity reached) are reachable
// this way — getEvent only ever returns published events, so "cancelled"
// isn't reachable from a page load; RegisterCTA still supports it for the
// rare race where an event is cancelled between page load and the click.
async function getInitialCTAState(
  event: {
    id: string;
    start_at: string;
    registration_deadline: string | null;
    capacity: number | null;
  },
  registrationCount: number | null,
): Promise<{
  state: RegisterCTAState;
  registrationId: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id, ticket_code")
      .eq("event_id", event.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return { state: "registered", registrationId: existing.id };
    }
  }

  if (isRegistrationClosed(event, new Date())) {
    return { state: "closed", registrationId: null };
  }

  if (
    event.capacity != null &&
    registrationCount != null &&
    registrationCount >= event.capacity
  ) {
    return { state: "full", registrationId: null };
  }

  if (!user) {
    return { state: "login_required", registrationId: null };
  }

  return { state: "idle", registrationId: null };
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

function ClubMark({
  name,
  category,
  className,
}: {
  name: string;
  category: CategoryKey;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center font-bold ${className ?? ""}`}
      style={{ backgroundColor: categoryColor(category), color: categoryInk(category) }}
    >
      {clubMonogram(name)}
    </span>
  );
}

function HostedBy({
  club,
  category,
}: {
  club: { name: string; slug: string; verified: boolean; category: string | null };
  category: CategoryKey;
}) {
  return (
    <section aria-labelledby="hosted-by">
      <h2 id="hosted-by" className="mb-2 text-[13px] font-semibold text-ink-soft">
        Hosted by
      </h2>
      <Link href={`/clubs/${club.slug}`} className="group flex items-center gap-3">
        <ClubMark name={club.name} category={category} className="h-11 w-11 rounded-xl text-[15px]" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-semibold text-ink group-hover:text-primary">
            <span className="truncate">{club.name}</span>
            {club.verified && <VerifiedBadge label={false} />}
          </span>
          <span className="block text-[13.5px] text-ink-soft">
            {club.category ? `${club.category} · ` : ""}See the society&apos;s page
          </span>
        </span>
      </Link>
    </section>
  );
}

/** "Lab 2, EE Department" → ["Lab 2", "EE Department"]. */
function splitVenue(venue: string | null): [string, string] {
  if (!venue) return ["To be announced", "Venue"];
  const comma = venue.indexOf(",");
  if (comma < 0) return [venue, "DTU campus"];
  return [venue.slice(0, comma).trim(), venue.slice(comma + 1).trim()];
}

const tileClass =
  "flex min-h-[100px] min-w-0 flex-col justify-between rounded-[14px] px-3 pt-2.5 pb-3 text-on-tile md:min-h-28 md:px-3.5 md:pt-3 md:pb-3.5";
const tileLabelClass = "text-[12.5px] font-bold tracking-[0.08em] uppercase md:text-[11px]";
// Long values (a venue like "Open Air Theatre (OAT)") get a smaller size so
// the three tiles stay about the same height.
const tileValueClass = (value: string) =>
  value.length > 12
    ? "font-display-tight mt-1.5 block text-[17px] leading-[1.05] [overflow-wrap:anywhere] md:text-[21px]"
    : "font-display-tight mt-1.5 block text-[21px] leading-none [overflow-wrap:anywhere] md:text-[26px]";
const tileNoteClass = "mt-1 block text-[12.5px] font-semibold";

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEvent(slug);

  if (!event) notFound();

  const registrationCount = await getRegistrationCount(event.id);
  const { state: ctaState, registrationId } = await getInitialCTAState(
    event,
    registrationCount,
  );

  // Display-only: whether to show manage controls. The admin pages
  // re-check access themselves.
  let canManage = false;
  if (event.club) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      canManage = canManageClub(
        await getViewerRoles(supabase, user.id),
        event.club.id,
      );
    }
  }

  const now = new Date();
  const registrationClosed = isRegistrationClosed(event, now);
  const category = categoryKey(event.category);
  const clubName = event.club?.name ?? "A DTU society";

  // A multi-day event shows its end day too ("Mon 8:00 am"), not just the
  // end time; the tile is too small for the full date.
  const endLabel = isSameIstDay(event.start_at, event.end_at)
    ? formatIstTime(event.end_at)
    : `${istDayParts(event.end_at).weekday} ${formatIstTime(event.end_at)}`;
  const hasEnd = event.end_at !== event.start_at;
  const happeningNow = isHappeningNow(event, now);
  const ended = now.getTime() > effectiveEventEnd(event.start_at, event.end_at).getTime();
  const whenNote = happeningNow ? "Happening now" : ended ? "This event has ended" : istRelativeDay(event.start_at, now);

  const spotsLeft =
    event.capacity != null && registrationCount != null
      ? Math.max(event.capacity - registrationCount, 0)
      : null;
  const [venueMain, venueNote] = splitVenue(event.venue);
  const spotsTile: [string, string] = registrationClosed
    ? registrationCount != null && registrationCount > 0
      ? [`${registrationCount} going`, "registration closed"]
      : ["Closed", "registration"]
    : event.capacity == null
      ? registrationCount != null && registrationCount > 0
        ? [`${registrationCount} going`, "no limit"]
        : ["Open", "no limit"]
      : spotsLeft != null
        ? spotsLeft === 0
          ? ["Full", `all ${event.capacity} taken`]
          : [`${spotsLeft} left`, `of ${event.capacity}`]
        : [`${event.capacity}`, "spots"];
  const spotsLine =
    spotsLeft != null && spotsLeft > 0
      ? `Free · ${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`
      : "Free entry";
  const closesLine = `${registrationClosed ? "Registration closed" : "Registration closes"} ${formatIstShortDate(registrationClosesAt(event))}, ${formatIstTime(registrationClosesAt(event))}`;

  return (
    <div
      className="flex-1"
      style={{
        backgroundImage: `linear-gradient(color-mix(in srgb, ${categoryColor(category)} 14%, var(--paper)), var(--paper) 440px)`,
      }}
    >
      <main className="mx-auto w-full max-w-[1064px] px-4 pt-4 pb-6 md:grid md:grid-cols-[360px_minmax(0,1fr)] md:gap-13 md:px-8 md:pt-12 md:pb-16">
        <div className="md:sticky md:top-24 md:self-start">
          <EventPoster
            title={event.title}
            clubName={clubName}
            bannerUrl={event.banner_url}
            category={category}
            size="hero"
            className={
              event.banner_url
                ? "aspect-video w-full rounded-[20px] shadow-card"
                : "aspect-[5/4] w-full rounded-[20px] shadow-card md:aspect-[4/5]"
            }
          />
          {event.club && (
            <div className="mt-6 hidden md:block">
              <HostedBy club={event.club} category={category} />
              <section
                aria-labelledby="good-to-know"
                className="mt-6 rounded-2xl border border-line bg-surface p-4 shadow-card"
              >
                <h2 id="good-to-know" className="text-[13px] font-semibold text-ink-soft">
                  Good to know
                </h2>
                <ul className="mt-2.5 space-y-2.5 text-[13.5px] text-ink">
                  <li className="flex gap-2.5">
                    <Icon name="ticket" className="mt-0.5 text-base text-ink-soft" />
                    Free entry. Registering gives you a QR ticket in My tickets.
                  </li>
                  <li className="flex gap-2.5">
                    <Icon name="clock" className="mt-0.5 text-base text-ink-soft" />
                    {closesLine}.
                  </li>
                  <li className="flex gap-2.5">
                    <Icon name="check" className="mt-0.5 text-base text-ink-soft" />
                    At the door, the society scans your QR to check you in.
                  </li>
                </ul>
              </section>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="mt-4 flex items-center gap-2 text-sm font-medium text-ink md:mt-0">
            {event.club && (
              <>
                <ClubMark name={event.club.name} category={category} className="h-6 w-6 rounded-[7px] text-[10px]" />
                <Link href={`/clubs/${event.club.slug}`} className="truncate hover:text-primary">
                  {event.club.name}
                </Link>
                {event.club.verified && <VerifiedBadge label={false} />}
              </>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[13px] font-normal text-ink-soft">
              <CategoryDot category={category} />
              {categoryLabel(category)}
            </span>
          </div>

          <DateNumeral
            instant={event.start_at}
            className="mt-4 gap-3 md:mt-5 md:gap-4"
            numeralClassName="text-[72px] md:text-[128px]"
          >
            {whenNote && (
              <span
                className={
                  happeningNow
                    ? "mt-1 block text-[13.5px] font-semibold text-live-text md:text-[15px]"
                    : "mt-1 block text-[13.5px] text-ink-soft md:text-[15px]"
                }
              >
                {whenNote}
              </span>
            )}
          </DateNumeral>

          <h1 className="mt-3.5 text-[28px] leading-[1.12] font-semibold tracking-[-0.035em] text-ink md:text-[40px]">
            {event.title}
          </h1>

          <dl className="mt-5 grid max-w-[560px] grid-cols-3 gap-2 md:gap-2.5">
            <div className={`${tileClass} bg-tile-when`}>
              <dt className={tileLabelClass}>When</dt>
              <dd>
                <b className={tileValueClass(formatIstTime(event.start_at))}>{formatIstTime(event.start_at)}</b>
                {hasEnd && <span className={tileNoteClass}>till {endLabel}</span>}
              </dd>
            </div>
            <div className={`${tileClass} bg-tile-where`}>
              <dt className={tileLabelClass}>Where</dt>
              <dd>
                <b className={tileValueClass(venueMain)}>{venueMain}</b>
                <span className={tileNoteClass}>{venueNote}</span>
              </dd>
            </div>
            <div className={`${tileClass} bg-tile-spots`}>
              <dt className={tileLabelClass}>Spots</dt>
              <dd>
                <b className={tileValueClass(spotsTile[0])}>{spotsTile[0]}</b>
                <span className={tileNoteClass}>{spotsTile[1]}</span>
              </dd>
            </div>
          </dl>

          {canManage && event.club && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ButtonLink
                href={`/admin/clubs/${event.club.id}/events/${event.id}`}
                variant="ghost"
                className="min-h-10 text-sm"
              >
                Edit event
              </ButtonLink>
              <ButtonLink
                href={`/admin/clubs/${event.club.id}/events/${event.id}/scan`}
                variant="ghost"
                className="min-h-10 text-sm"
              >
                Scan tickets
              </ButtonLink>
            </div>
          )}

          <div className="md:mt-5">
            <RegisterCTA
              initialState={ctaState}
              initialRegistrationId={registrationId}
              spotsLine={spotsLine}
              closesLine={closesLine}
              registerAction={registerForEvent.bind(null, event.id, event.slug)}
            />
          </div>

          {event.description && (
            <section aria-labelledby="about" className="mt-7 border-t border-line pt-5">
              <h2 id="about" className="mb-2 text-[13px] font-semibold text-ink-soft">
                About
              </h2>
              <p className="text-[15.5px] leading-relaxed whitespace-pre-wrap text-ink">
                {event.description}
              </p>
            </section>
          )}

          {event.club && (
            <div className="mt-7 border-t border-line pt-5 md:hidden">
              <HostedBy club={event.club} category={category} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
