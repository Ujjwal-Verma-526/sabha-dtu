import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ui/ActionForm";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { EventForm } from "@/components/events/EventForm";
import { EventStatusBadge } from "@/components/events/EventStatusBadge";
import { CancelEventButton } from "@/components/events/CancelEventButton";
import { updateEvent, publishEvent, cancelEvent } from "../actions";

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time —
// toISOString() gives UTC with seconds/millis, so this trims and shifts.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

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
    return (
      <main className="mx-auto max-w-lg flex-1 px-6 py-16 text-center">
        <p className="text-ink-soft">You don&apos;t manage this club.</p>
      </main>
    );
  }

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, club_id, title, slug, description, banner_url, venue, start_at, end_at, registration_deadline, capacity, status",
    )
    .eq("id", eventId)
    .eq("club_id", clubId)
    .maybeSingle();

  if (!event) notFound();

  const updateWithIds = updateEvent.bind(null, clubId, eventId);
  const publish = publishEvent.bind(null, clubId, eventId);
  const cancel = cancelEvent.bind(null, clubId, eventId);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              ...(isSuperAdmin ? [{ label: "Admin", href: "/admin/clubs" }] : []),
              { label: club.name, href: `/admin/clubs/${clubId}` },
              { label: "Events", href: `/admin/clubs/${clubId}/events` },
              { label: event.title },
            ]}
          />
          <h1 className="font-display text-2xl font-bold text-ink">
            {event.title}
          </h1>
        </div>
        <EventStatusBadge status={event.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {event.status === "draft" && (
          <ActionForm action={publish}>
            <SubmitButton
              variant="primary"
              className="text-sm"
              pendingLabel="Publishing…"
            >
              Publish
            </SubmitButton>
          </ActionForm>
        )}
        {(event.status === "draft" || event.status === "published") && (
          <CancelEventButton cancelAction={cancel} />
        )}
        {event.status === "published" && (
          <a
            href={`/events/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            View public page →
          </a>
        )}
      </div>

      <EventForm
        clubId={clubId}
        action={updateWithIds}
        initialValues={{
          title: event.title,
          description: event.description ?? "",
          venue: event.venue ?? "",
          start_at: toDatetimeLocal(event.start_at),
          end_at: toDatetimeLocal(event.end_at),
          registration_deadline: event.registration_deadline
            ? toDatetimeLocal(event.registration_deadline)
            : "",
          capacity: event.capacity == null ? "" : String(event.capacity),
          banner_url: event.banner_url ?? "",
        }}
        submitLabel="Save changes"
        pendingLabel="Saving…"
      />
    </main>
  );
}
