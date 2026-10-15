import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { NotManager } from "@/components/layout/ManageNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EventStatusBadge } from "@/components/events/EventStatusBadge";
import { formatIstDateTime } from "@/lib/ist";
import type { EventStatus } from "@/lib/supabase/types";

const SECTIONS: { status: EventStatus; label: string; hint: string }[] = [
  {
    status: "draft",
    label: "Drafts",
    hint: "Not visible to students yet. Finish and publish when ready.",
  },
  {
    status: "published",
    label: "Published",
    hint: "Live on the public events feed right now.",
  },
  {
    status: "cancelled",
    label: "Cancelled",
    hint: "Kept for the record, no longer shown publicly.",
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
    return <NotManager />;
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
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-16 md:px-8 md:pt-10">
      <Breadcrumbs
        items={[
          ...(isSuperAdmin ? [{ label: "Manage", href: "/admin/clubs" }] : []),
          { label: club.name, href: `/admin/clubs/${clubId}` },
          { label: "Events" },
        ]}
      />
      <PageHeader
        size="md"
        title="Events"
        description={club.name}
        actions={
          <ButtonLink href={`/admin/clubs/${clubId}/events/new`}>
            <Icon name="plus" strokeWidth={2.2} />
            New event
          </ButtonLink>
        }
      />

      <div className="mt-6 flex flex-col gap-9">
        {SECTIONS.map((section) => {
          const items = byStatus(section.status);
          if (items.length === 0) return null;

          return (
            <section key={section.status} aria-labelledby={`${section.status}-heading`}>
              <h2 id={`${section.status}-heading`} className="font-semibold text-ink">
                {section.label} <span className="font-medium text-ink-soft">· {items.length}</span>
              </h2>
              <p className="mt-0.5 text-[13px] text-ink-soft">{section.hint}</p>

              <ul className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
                {items.map((event) => (
                  <li key={event.id} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/admin/clubs/${clubId}/events/${event.id}`}
                      className="group flex items-center gap-3 px-4 py-3.5 hover:bg-soft"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold break-words text-ink group-hover:text-primary">
                          {event.title}
                        </p>
                        <p className="text-[13px] text-ink-soft">
                          {formatIstDateTime(event.start_at)}
                          {event.capacity != null && ` · ${event.capacity} seats`}
                        </p>
                      </div>
                      <EventStatusBadge status={event.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {(!events || events.length === 0) && (
          <EmptyState
            icon="calendar"
            title="No events yet"
            action={
              <ButtonLink href={`/admin/clubs/${clubId}/events/new`}>New event</ButtonLink>
            }
          >
            Create your first event. It starts as a draft, so nothing goes live until you publish
            it.
          </EmptyState>
        )}
      </div>
    </main>
  );
}
