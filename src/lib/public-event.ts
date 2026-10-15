import { createClient } from "@/lib/supabase/server";
import type { ShareableEvent } from "@/lib/event-share";

export type PublicEventForShare = ShareableEvent & {
  category: string;
  banner_url: string | null;
};

/**
 * A published event by slug, in the shape the share image and the calendar
 * file need; null for anything else (a draft, a cancelled or completed event,
 * a slug that doesn't exist), so those routes answer all of them the same way
 * and reveal nothing about unpublished events. RLS shows an anonymous reader
 * published events anyway; the status filter keeps a signed-in club manager,
 * who can read their own drafts, from getting one either.
 */
export async function getPublicEventForShare(slug: string): Promise<PublicEventForShare | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select(
      "id, title, slug, category, description, banner_url, venue, start_at, end_at, club:clubs(name)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as Omit<PublicEventForShare, "clubName"> & {
    club: { name: string } | null;
  };
  const { club, ...event } = row;
  return { ...event, clubName: club?.name ?? null };
}
