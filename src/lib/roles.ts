import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Role lookups used only to decide which navigation/buttons to *show*.
// They run through the viewer's own session, so RLS decides what comes back.
// They are never an authorization check: every admin page and server action
// still does its own check before reading or writing anything.

export type ManagedClub = { id: string; name: string; slug: string };

export type ViewerRoles = {
  isSuperAdmin: boolean;
  /** Clubs where the viewer is an approved admin/coordinator. */
  managedClubs: ManagedClub[];
};

const NO_ROLES: ViewerRoles = { isSuperAdmin: false, managedClubs: [] };

export async function getViewerRoles(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ViewerRoles> {
  const [profileResult, membershipResult] = await Promise.all([
    supabase.from("users").select("role").eq("id", userId).maybeSingle(),
    supabase
      .from("club_members")
      .select("club_id")
      .eq("user_id", userId)
      .eq("status", "approved")
      .in("role", ["admin", "coordinator"]),
  ]);

  if (profileResult.error || membershipResult.error) {
    // Fail closed: showing no admin links is always safe.
    console.error(
      "getViewerRoles failed",
      profileResult.error?.message,
      membershipResult.error?.message,
    );
    return NO_ROLES;
  }

  const isSuperAdmin = profileResult.data?.role === "super_admin";
  const clubIds = (membershipResult.data ?? []).map((m) => m.club_id);

  if (clubIds.length === 0) return { isSuperAdmin, managedClubs: [] };

  const { data: clubs, error } = await supabase
    .from("clubs")
    .select("id, name, slug")
    .in("id", clubIds)
    .order("name");

  if (error) {
    console.error("getViewerRoles clubs lookup failed", error.message);
    return { isSuperAdmin, managedClubs: [] };
  }

  return { isSuperAdmin, managedClubs: clubs ?? [] };
}

/** True if the viewer should see manage controls for this club. */
export function canManageClub(roles: ViewerRoles, clubId: string): boolean {
  return (
    roles.isSuperAdmin || roles.managedClubs.some((club) => club.id === clubId)
  );
}
