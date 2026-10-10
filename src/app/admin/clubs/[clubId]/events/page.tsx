import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ButtonLink } from "@/components/ui/Button";
import { EventStatusBadge } from "@/components/events/EventStatusBadge";
import { formatIstDateTime } from "@/lib/ist";
import type { EventStatus } from "@/lib/supabase/types";

const SECTIONS: { status: EventStatus; label: string; hint: string }[] = [
  {
    status: "draft",
    label: "Drafts",
    hint: "Not visible to students yet — finish and publish when ready.",
  },
  {
    status: "published",
    label: "Published",
    hint: "Live on the public events feed right now.",
  },
  {
    status: "cancelled",
    label: "Cancelled",
    hint: "Kept for the record — no longer shown publicly.",
  },
  {
    status: "completed",
    label: "Completed",
    hint: "Already happened.",
  },
];

export default async function ClubEventsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
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

  // Manager/super_admin: events_select_published_or_manager lets this
  // return every status for this club, not just published.
  const { data: events } = await supabase
    .from("events")
    .select("id, title, slug, start_at, status, capacity")
    .eq("club_id", clubId)
    .order("start_at", { ascending: false });

  const byStatus = (status: EventStatus) =>
    (events ?? []).filter((e) => e.status === status);

  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              ...(isSuperAdmin ? [{ label: "Admin", href: "/admin/clubs" }] : []),
              { label: club.name, href: `/admin/clubs/${clubId}` },
              { label: "Events" },
            ]}
          />
          <h1 className="font-display text-2xl font-bold text-ink">
            Events
          </h1>
        </div>
        <ButtonLink
          href={`/admin/clubs/${clubId}/events/new`}
          variant="primary"
          className="text-sm"
        >
          New event
        </ButtonLink>
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {SECTIONS.map((section) => {
          const items = byStatus(section.status);
          if (items.length === 0) return null;

          return (
            <section key={section.status}>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-semibold text-ink">
                  {section.label}
                </h2>
                <span className="font-mono text-xs text-ink-soft">
                  {items.length}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-soft">{section.hint}</p>

              <div className="mt-3 flex flex-col gap-3">
                {items.map((event) => (
                  <Link
                    key={event.id}
                    href={`/admin/clubs/${clubId}/events/${event.id}`}
                  >
                    <Card className="flex items-center justify-between gap-3 transition-colors hover:border-primary">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {event.title}
                        </p>
                        <p className="font-mono text-xs text-ink-soft">
                          {formatIstDateTime(event.start_at)}
                        </p>
                      </div>
                      <EventStatusBadge status={event.status} />
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {(!events || events.length === 0) && (
          <div className="mt-8 flex flex-col items-center gap-2 py-16 text-center">
            <p className="font-display text-lg font-semibold text-ink">
              No events yet.
            </p>
            <p className="max-w-sm text-sm text-ink-soft">
              Create your first event — it starts as a draft, so nothing
              goes live until you publish it.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
