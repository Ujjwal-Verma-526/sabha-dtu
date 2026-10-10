import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { EventForm } from "@/components/events/EventForm";
import { emptyEventValues } from "@/lib/event-form";
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
    return (
      <main className="mx-auto max-w-lg flex-1 px-6 py-16 text-center">
        <p className="text-ink-soft">You don&apos;t manage this club.</p>
      </main>
    );
  }

  const createWithClub = createEvent.bind(null, clubId);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
      <Breadcrumbs
        items={[
          ...(isSuperAdmin ? [{ label: "Admin", href: "/admin/clubs" }] : []),
          { label: club.name, href: `/admin/clubs/${clubId}` },
          { label: "Events", href: `/admin/clubs/${clubId}/events` },
          { label: "New event" },
        ]}
      />
      <h1 className="font-display text-2xl font-bold text-ink">New event</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Saves as a draft first — nothing is public until you publish it.
      </p>

      <EventForm
        clubId={clubId}
        action={createWithClub}
        initialValues={emptyEventValues}
        submitLabel="Save draft"
        pendingLabel="Saving…"
      />
    </main>
  );
}
