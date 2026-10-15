import type { createClient } from "@/lib/supabase/server";
import { getTicketState } from "@/lib/tickets";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type NextTicket = {
  registrationId: string;
  title: string;
  slug: string;
  venue: string | null;
  clubName: string;
  startAt: string;
  endAt: string;
};

export type ViewerRegistrations = {
  /** Slugs of the events the viewer is registered for and that are still on. */
  goingSlugs: Set<string>;
  /** Their soonest registered event that hasn't ended: running now, or next up. */
  nextTicket: NextTicket | null;
};

/**
 * The signed-in viewer's own registrations, for the "You're going" marks and
 * the "Your next ticket" card. Null when nobody is signed in (no query is
 * made then) and when the read fails; both just mean no marks, since the
 * marks are a courtesy and the pages work without them.
 *
 * One call to get_my_registrations(): the same security-definer function
 * /tickets uses, which only ever returns the caller's own rows (it filters on
 * auth.uid()) and no tokens. Pass the same server client the page uses, so
 * the viewer is whoever the session cookie says.
 */
export async function getViewerRegistrations(
  supabase: ServerClient,
  now: Date,
): Promise<ViewerRegistrations | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("get_my_registrations");
  if (error) {
    console.error("Could not load the viewer's registrations", error.message);
    return null;
  }

  // Ordered by start time already. "active" is published and not yet over.
  const current = data.filter(
    (row) =>
      getTicketState(row.event_status, row.event_start_at, row.event_end_at, now) === "active",
  );
  const first = current[0];
  return {
    goingSlugs: new Set(current.map((row) => row.event_slug)),
    nextTicket: first
      ? {
          registrationId: first.registration_id,
          title: first.event_title,
          slug: first.event_slug,
          venue: first.event_venue,
          clubName: first.club_name,
          startAt: first.event_start_at,
          endAt: first.event_end_at,
        }
      : null,
  };
}
