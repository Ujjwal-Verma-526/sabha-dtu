"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  actionError,
  idleState,
  type ActionState,
} from "@/lib/action-state";
import {
  NOT_ALLOWED_MESSAGE,
  friendlyDbError,
  isUniqueViolation,
} from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

// Self-service join request. Every write here goes through the normal
// authenticated client, so RLS enforces the same rules a direct API call
// would face — this action doesn't have any elevated access of its own.
export async function requestToJoin(
  clubId: string,
  slug: string,
  _previousState: ActionState,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: existing, error: lookupError } = await supabase
    .from("club_members")
    .select("id, status")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    return actionError(friendlyDbError(lookupError, "checking club membership"));
  }

  if (existing && existing.status !== "rejected") {
    // Already pending or approved (e.g. a second tab): nothing to do, and the
    // refreshed page shows the current state.
    revalidatePath(`/clubs/${slug}`);
    return idleState;
  }

  if (existing) {
    // "Request again": withdraw the old row, then send a fresh pending
    // one. Both steps are ordinary self-service operations already
    // allowed by RLS (delete own row, insert a new pending self-request)
    // — no policy change needed to support this.
    const { data: deleted, error: deleteError } = await supabase
      .from("club_members")
      .delete()
      .eq("id", existing.id)
      .select("id");

    if (deleteError) {
      return actionError(friendlyDbError(deleteError, "withdrawing a join request"));
    }
    if (deleted.length === 0) {
      return actionError(NOT_ALLOWED_MESSAGE);
    }
  }

  const { error: insertError } = await supabase
    .from("club_members")
    .insert({ club_id: clubId, user_id: user.id });

  // unique(club_id, user_id): a double submit already created the request.
  if (insertError && !isUniqueViolation(insertError)) {
    return actionError(friendlyDbError(insertError, "requesting to join a club"));
  }

  // The page re-renders as "Request pending", which is the confirmation.
  revalidatePath(`/clubs/${slug}`);
  return idleState;
}
