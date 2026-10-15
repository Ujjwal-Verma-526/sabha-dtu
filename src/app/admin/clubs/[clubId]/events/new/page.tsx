import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { NotManager } from "@/components/layout/ManageNotice";
import { PageHeader } from "@/components/ui/PageHeader";
import { EventForm } from "@/components/events/EventForm";
import { emptyEventValues, recentVenues } from "@/lib/event-form";
import { createEvent } from "../actions";

export default async function NewEventPage({
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

  // Venue shortcuts from the club's own events, under the existing events
  // SELECT policy (managers see their club's drafts and cancelled events too).
  const { data: venueRows } = await supabase
    .from("events")
    .select("venue")
    .eq("club_id", clubId)
    .order("start_at", { ascending: false })
    .limit(30);

  const createWithClub = createEvent.bind(null, clubId);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-5 pb-16 md:px-8 md:pt-10">
      <Breadcrumbs
        items={[
          ...(isSuperAdmin ? [{ label: "Manage", href: "/admin/clubs" }] : []),
          { label: club.name, href: `/admin/clubs/${clubId}` },
          { label: "Events", href: `/admin/clubs/${clubId}/events` },
          { label: "New event" },
        ]}
      />
      <PageHeader
        size="md"
        title="New event"
        description={`For ${club.name}. Publish to put it on Sabha now, or save a draft to finish later.`}
      />

      <EventForm
        clubId={clubId}
        action={createWithClub}
        initialValues={emptyEventValues}
        status={null}
        recentVenues={recentVenues(venueRows ?? [])}
      />
    </main>
  );
}
