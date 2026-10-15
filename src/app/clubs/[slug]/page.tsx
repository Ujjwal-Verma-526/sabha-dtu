import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClubLogo } from "@/components/clubs/ClubLogo";
import { VerifiedBadge } from "@/components/clubs/VerifiedBadge";
import { ButtonLink } from "@/components/ui/Button";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { sectionHeadingClass } from "@/components/ui/PageHeader";
import { DateNumeral } from "@/components/events/DateNumeral";
import { EventRow, type EventListData } from "@/components/events/EventListItems";
import { formatIstShortDate, istDayKey, istRelativeDay } from "@/lib/ist";
import { cn } from "@/lib/utils";
import { requestToJoin } from "./actions";

export default async function ClubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select(
      "id, name, slug, description, logo_url, category, instagram_handle, verified",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!club) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: events }, { data: membership }, { data: profile }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, slug, title, banner_url, venue, start_at, end_at, capacity, category")
        .eq("club_id", club.id)
        .eq("status", "published")
        .gte("start_at", new Date().toISOString())
        .order("start_at")
        .limit(10),
      user
        ? supabase
            .from("club_members")
            .select("role, status")
            .eq("club_id", club.id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase.from("users").select("role").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const isManager =
    (membership?.status === "approved" &&
      (membership.role === "admin" || membership.role === "coordinator")) ||
    profile?.role === "super_admin";

  const now = new Date();
  const host = { name: club.name, slug: club.slug, verified: club.verified };
  // Day groups (IST), soonest first, as on /events.
  const days: { key: string; events: EventListData[] }[] = [];
  for (const event of events ?? []) {
    const listed = { ...event, club: host };
    const key = istDayKey(event.start_at);
    const last = days[days.length - 1];
    if (last?.key === key) last.events.push(listed);
    else days.push({ key, events: [listed] });
  }
  const instagram = club.instagram_handle?.replace(/^@/, "");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-16 md:px-8 md:pt-11">
      <div className="flex items-start gap-4 md:gap-5">
        <ClubLogo
          name={club.name}
          logoUrl={club.logo_url}
          className="h-16 w-16 shrink-0 rounded-2xl text-xl md:h-20 md:w-20 md:text-2xl"
        />
        <div className="min-w-0">
          <h1 className="text-[28px] leading-[1.12] font-semibold tracking-[-0.035em] break-words text-ink md:text-[36px]">
            {club.name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-soft">
            {club.verified && <VerifiedBadge />}
            {club.category && <span>{club.category}</span>}
            {instagram && (
              <a
                href={`https://instagram.com/${instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                @{instagram}
              </a>
            )}
          </p>
        </div>
      </div>

      {club.description && (
        <p className="mt-5 text-[15.5px] leading-relaxed text-ink">{club.description}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <MembershipAction
          clubId={club.id}
          slug={club.slug}
          isSignedIn={!!user}
          status={membership?.status ?? null}
        />
        {isManager && (
          <>
            <ButtonLink href={`/admin/clubs/${club.id}`} variant="ghost">
              <Icon name="manage" />
              Manage club
            </ButtonLink>
            <ButtonLink href={`/admin/clubs/${club.id}/events/new`} variant="ghost">
              Create event
            </ButtonLink>
          </>
        )}
      </div>

      <section aria-labelledby="upcoming-heading" className="mt-10 md:mt-12">
        <h2 id="upcoming-heading" className={sectionHeadingClass}>
          Upcoming events
        </h2>
        {days.length > 0 ? (
          days.map((day) => (
            <section
              key={day.key}
              aria-label={formatIstShortDate(day.events[0].start_at)}
              className="mt-4 md:grid md:grid-cols-[112px_minmax(0,1fr)] md:gap-6 md:border-t md:border-line md:pt-5"
            >
              <div className="flex items-end gap-2.5 border-b border-line pb-2.5 md:block md:self-start md:border-0 md:pb-0">
                <DateNumeral
                  instant={day.events[0].start_at}
                  className="md:flex-col md:items-start md:gap-2"
                  numeralClassName="md:text-[56px]"
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
            </section>
          ))
        ) : (
          <EmptyState
            icon="calendar"
            title="No upcoming events"
            className="mt-3"
            action={
              <ButtonLink href="/events" variant="soft">
                Browse all events
              </ButtonLink>
            }
          >
            When {club.name} publishes an event, it shows up here.
          </EmptyState>
        )}
      </section>
    </main>
  );
}

// Same size as a button, so it lines up with "Manage club" beside it.
const statusPillClass =
  "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold";

function MembershipAction({
  clubId,
  slug,
  isSignedIn,
  status,
}: {
  clubId: string;
  slug: string;
  isSignedIn: boolean;
  status: "pending" | "approved" | "rejected" | null;
}) {
  if (!isSignedIn) {
    return (
      <ButtonLink href="/login" variant="ghost">
        Sign in to request to join
      </ButtonLink>
    );
  }

  if (status === "approved") {
    return (
      <span className={cn(statusPillClass, "bg-success-soft text-success")}>
        <Icon name="check" strokeWidth={2.4} />
        Member
      </span>
    );
  }

  if (status === "pending") {
    return (
      <span className={cn(statusPillClass, "bg-soft text-ink-soft")}>
        <Icon name="clock" />
        Request pending
      </span>
    );
  }

  const joinWithArgs = requestToJoin.bind(null, clubId, slug);

  return (
    <ActionForm action={joinWithArgs}>
      <SubmitButton variant="primary" pendingLabel="Sending…">
        {status === "rejected" ? "Request again" : "Request to join"}
      </SubmitButton>
    </ActionForm>
  );
}
