import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/Button";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { NotManager } from "@/components/layout/ManageNotice";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { EventForm } from "@/components/events/EventForm";
import { EventStatusBadge } from "@/components/events/EventStatusBadge";
import { CancelEventButton } from "@/components/events/CancelEventButton";
import { eventTimingValues, recentVenues } from "@/lib/event-form";
import { toIstDateTimeLocal } from "@/lib/ist";
import { updateEvent, cancelEvent } from "../actions";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ clubId: string; eventId: string }>;
}) {
  const { clubId, eventId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: club }, { data: membership }, { data: profile }] =
    await Promise.all([
      supabase.from("clubs").select("id, name").eq("id", clubId).maybeSingle(),
      supabase
        .from("club_members")
        .select("role, status")
        .eq("club_id", clubId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
    ]);

  if (!club) notFound();

  const isSuperAdmin = profile?.role === "super_admin";
  const isManager =
    membership?.status === "approved" &&
    (membership.role === "admin" || membership.role === "coordinator");

  if (!isSuperAdmin && !isManager) {
    return <NotManager />;
  }

  const [{ data: event }, { data: venueRows }] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, club_id, title, slug, category, description, banner_url, venue, start_at, end_at, registration_deadline, capacity, status",
      )
      .eq("id", eventId)
      .eq("club_id", clubId)
      .maybeSingle(),
    // Venue shortcuts from the club's other events, under the existing
    // events SELECT policy.
    supabase
      .from("events")
      .select("venue")
      .eq("club_id", clubId)
      .neq("id", eventId)
      .order("start_at", { ascending: false })
      .limit(30),
  ]);

  if (!event) notFound();

  const updateWithIds = updateEvent.bind(null, clubId, eventId);
  const cancel = cancelEvent.bind(null, clubId, eventId);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-5 pb-16 md:px-8 md:pt-10">
      <Breadcrumbs
        items={[
          ...(isSuperAdmin ? [{ label: "Manage", href: "/admin/clubs" }] : []),
          { label: club.name, href: `/admin/clubs/${clubId}` },
          { label: "Events", href: `/admin/clubs/${clubId}/events` },
          { label: event.title },
        ]}
      />
      <EventStatusBadge status={event.status} />
      <PageHeader size="md" className="mt-2" title={event.title} />

      {/* Publishing is the form's own "Publish" button, which saves any edits
          in the same step. */}
      {(event.status === "draft" || event.status === "published") && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {event.status === "published" && (
            <ButtonLink href={`/admin/clubs/${clubId}/events/${eventId}/scan`}>
              <Icon name="scan" />
              Scan tickets
            </ButtonLink>
          )}
          {event.status === "published" && (
            <a
              href={`/events/${event.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-control bg-surface px-4 text-[15px] font-semibold text-ink hover:border-ink"
            >
              Public page
              <Icon name="arrowRight" />
            </a>
          )}
          <CancelEventButton cancelAction={cancel} />
        </div>
      )}

      <EventForm
        clubId={clubId}
        action={updateWithIds}
        initialValues={{
          title: event.title,
          category: event.category,
          description: event.description ?? "",
          venue: event.venue ?? "",
          ...eventTimingValues(event.start_at, event.end_at),
          deadline_mode: event.registration_deadline ? "custom" : "start",
          registration_deadline: event.registration_deadline
            ? toIstDateTimeLocal(event.registration_deadline)
            : "",
          capacity: event.capacity == null ? "" : String(event.capacity),
          banner_url: event.banner_url ?? "",
        }}
        status={event.status}
        recentVenues={recentVenues(venueRows ?? [])}
      />
    </main>
  );
}
