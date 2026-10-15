import type { createClient } from "@/lib/supabase/server";
import { EVENT_END_FALLBACK_HOURS } from "@/lib/tickets";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const HOUR_MS = 60 * 60 * 1000;

/**
 * The public event feed that /events and the landing page read: only
 * published events belonging to a verified club, soonest first. The
 * clubs!inner join plus the club.verified filter keeps an unverified
 * club's events out, same as /clubs already does for the club directory
 * itself. Callers add their own time range and filters; the rows match
 * EventListData.
 */
export function publicEventFeed(supabase: ServerClient) {
  return supabase
    .from("events")
    .select(
      "id, title, slug, category, banner_url, venue, start_at, end_at, capacity, club:clubs!inner(name, slug, verified)",
    )
    .eq("status", "published")
    .eq("club.verified", true)
    .order("start_at");
}

/**
 * Earliest end_at a running event can have at `now`. end_at >= this is a
 * superset of "happening now" (an event with end_at = start_at counts as
 * running for EVENT_END_FALLBACK_HOURS); filter the rows with
 * isHappeningNow for the exact effective-end rule, the same one tickets
 * and door check-in use.
 */
export function happeningNowEndFloor(now: Date): string {
  return new Date(now.getTime() - EVENT_END_FALLBACK_HOURS * HOUR_MS).toISOString();
}
