import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { BannerUpload } from "@/components/events/BannerUpload";
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
  searchParams,
}: {
  params: Promise<{ clubId: string; eventId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { clubId, eventId } = await params;
  const { error } = await searchParams;

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
          <form action={publish}>
            <SubmitButton
              variant="primary"
              className="text-sm"
              pendingLabel="Publishing…"
            >
              Publish
            </SubmitButton>
          </form>
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

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Card className="mt-6">
        <form action={updateWithIds} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Banner image</span>
            <BannerUpload clubId={clubId} defaultValue={event.banner_url} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Title</span>
            <Input name="title" required defaultValue={event.title} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Description</span>
            <Textarea
              name="description"
              required
              rows={4}
              defaultValue={event.description ?? ""}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Venue</span>
            <Input name="venue" required defaultValue={event.venue ?? ""} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Starts</span>
              <Input
                name="start_at"
                type="datetime-local"
                required
                defaultValue={toDatetimeLocal(event.start_at)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Ends</span>
              <Input
                name="end_at"
                type="datetime-local"
                required
                defaultValue={toDatetimeLocal(event.end_at)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              Registration deadline{" "}
              <span className="font-normal text-ink-soft">(optional)</span>
            </span>
            <Input
              name="registration_deadline"
              type="datetime-local"
              defaultValue={
                event.registration_deadline
                  ? toDatetimeLocal(event.registration_deadline)
                  : ""
              }
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              Capacity{" "}
              <span className="font-normal text-ink-soft">(optional)</span>
            </span>
            <Input
              name="capacity"
              type="number"
              min={1}
              defaultValue={event.capacity ?? ""}
            />
          </label>

          <SubmitButton variant="primary" className="mt-2" pendingLabel="Saving…">
            Save changes
          </SubmitButton>
        </form>
      </Card>
    </main>
  );
}
