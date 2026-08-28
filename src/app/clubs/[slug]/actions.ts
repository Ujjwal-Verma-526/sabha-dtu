"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Self-service join request. Every write here goes through the normal
// authenticated client, so RLS enforces the same rules a direct API call
// would face — this action doesn't have any elevated access of its own.
export async function requestToJoin(clubId: string, slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: existing } = await supabase
    .from("club_members")
    .select("id, status")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    await supabase
      .from("club_members")
      .insert({ club_id: clubId, user_id: user.id });
  } else if (existing.status === "rejected") {
    // "Request again": withdraw the old row, then send a fresh pending
    // one. Both steps are ordinary self-service operations already
    // allowed by RLS (delete own row, insert a new pending self-request)
    // — no policy change needed to support this.
    await supabase.from("club_members").delete().eq("id", existing.id);
    await supabase
      .from("club_members")
      .insert({ club_id: clubId, user_id: user.id });
  }

  revalidatePath(`/clubs/${slug}`);
}
