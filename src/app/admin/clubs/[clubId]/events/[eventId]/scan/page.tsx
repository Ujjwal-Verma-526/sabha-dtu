import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CheckInConsole } from "@/components/checkin/CheckInConsole";
import { EventStatusBadge } from "@/components/events/EventStatusBadge";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { loginPathFor } from "@/lib/auth-redirect";
import { describeWindow, getWindowStatus } from "@/lib/check-in";
import { formatIstDateTime, formatIstTime, isSameIstDay } from "@/lib/ist";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { checkInByToken, getCheckInCounts, manualCheckIn, undoCheckIn } from "./actions";

export const metadata: Metadata = {
  title: "Scan tickets — Sabha",
  robots: { index: false, follow: false },
};

export default async function ScanTicketsPage({
  params,
}: {
  params: Promise<{ clubId: string; eventId: string }>;
}) {
  const { clubId, eventId } = await params;
  const scanPath = `/admin/clubs/${clubId}/events/${eventId}/scan`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginPathFor(scanPath));

  // Same page-level check as the other admin event pages. The check-in
  // RPCs enforce it again, along with the event's status and time window.
  const [clubResult, membershipResult, profileResult] = await Promise.all([
    supabase.from("clubs").select("id, name").eq("id", clubId).maybeSingle(),
    supabase
      .from("club_members")
      .select("role, status")
      .eq("club_id", clubId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
  ]);
  const lookupError = clubResult.error ?? membershipResult.error ?? profileResult.error;
  if (lookupError) throw new Error(`Could not load this club: ${lookupError.message}`);

  const club = clubResult.data;
  if (!club) notFound();

  const isSuperAdmin = profileResult.data?.role === "super_admin";
  const membership = membershipResult.data;
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

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, venue, start_at, end_at, status")
    .eq("id", eventId)
    .eq("club_id", clubId)
    .maybeSingle();
  if (eventError) throw new Error(`Could not load this event: ${eventError.message}`);
  if (!event) notFound();

  const { data: rows, error: listError } = await supabase.rpc("get_event_check_in_list", {
    p_event_id: eventId,
  });
  if (listError) throw new Error(`Could not load the registrant list: ${listError.message}`);

  const now = new Date();
  const windowStatus = getWindowStatus(event, now);
  const endLabel = isSameIstDay(event.start_at, event.end_at)
    ? formatIstTime(event.end_at)
    : formatIstDateTime(event.end_at);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <Breadcrumbs
        items={[
          ...(isSuperAdmin ? [{ label: "Admin", href: "/admin/clubs" }] : []),
          { label: club.name, href: `/admin/clubs/${clubId}` },
          { label: "Events", href: `/admin/clubs/${clubId}/events` },
          { label: event.title, href: `/admin/clubs/${clubId}/events/${eventId}` },
          { label: "Scan" },
        ]}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-ink">Scan tickets</h1>
          <p className="mt-1 break-words font-medium text-ink">{event.title}</p>
          <p className="mt-1 font-mono text-xs text-ink-soft">
            {/* nowrap per side, so a narrow screen breaks at the dash. */}
            <span className="whitespace-nowrap">{formatIstDateTime(event.start_at)} –</span>{" "}
            <span className="whitespace-nowrap">{endLabel}</span>
            {event.venue && <> · {event.venue}</>}
          </p>
        </div>
        <EventStatusBadge status={event.status} />
      </div>

      <p
        className={cn(
          "mt-4 rounded-xl border px-4 py-3 text-sm",
          windowStatus.kind === "open"
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-amber-200 bg-amber-50 text-amber-900",
        )}
      >
        {describeWindow(windowStatus, now)}
      </p>

      <div className="mt-6">
        <CheckInConsole
          eventId={event.id}
          initialRows={rows}
          initialCounts={{
            registered: rows.length,
            checkedIn: rows.filter((row) => row.checked_in_at !== null).length,
          }}
          actions={{ checkInByToken, manualCheckIn, undoCheckIn, getCheckInCounts }}
        />
      </div>
    </main>
  );
}
