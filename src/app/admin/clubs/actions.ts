"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// Page-level guards already keep non-super-admins away from this form —
// this check just avoids a confusing silent no-op for a direct POST.
// The clubs_insert_super_admin RLS policy is what actually enforces it.
export async function createClub(formData: FormData) {
  const { supabase, user } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  const adminUserId =
    (formData.get("admin_user_id") as string)?.trim() || user.id;

  const { data: club, error } = await supabase
    .from("clubs")
    .insert({
      name,
      slug: slugify(name),
      description: (formData.get("description") as string) || null,
      category: (formData.get("category") as string) || null,
      instagram_handle: (formData.get("instagram_handle") as string) || null,
      created_by: adminUserId,
      verified: formData.get("verified") === "on",
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/admin/clubs/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/clubs");
  redirect(`/admin/clubs/${club.id}`);
}

// Whitelisted fields only — never slug, verified, created_by, or id.
// RLS (clubs_update_manager_or_super_admin + the protected-field trigger)
// is the real backstop; this whitelist just keeps the form honest.
export async function updateClub(clubId: string, formData: FormData) {
  const { supabase } = await requireUser();

  await supabase
    .from("clubs")
    .update({
      description: (formData.get("description") as string) || null,
      logo_url: (formData.get("logo_url") as string) || null,
      category: (formData.get("category") as string) || null,
      instagram_handle: (formData.get("instagram_handle") as string) || null,
    })
    .eq("id", clubId);

  revalidatePath(`/admin/clubs/${clubId}`);
  revalidatePath("/clubs");
}

// Only a super_admin's UPDATE actually changes `verified` — the
// prevent_club_protected_field_changes trigger rejects anyone else's
// attempt regardless of what this action does.
export async function setClubVerified(clubId: string, verified: boolean) {
  const { supabase } = await requireUser();
  await supabase.from("clubs").update({ verified }).eq("id", clubId);
  revalidatePath(`/admin/clubs/${clubId}`);
  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
}

export async function approveMembership(clubId: string, membershipId: string) {
  const { supabase } = await requireUser();
  await supabase
    .from("club_members")
    .update({ status: "approved" })
    .eq("id", membershipId);
  revalidatePath(`/admin/clubs/${clubId}`);
}

export async function rejectMembership(clubId: string, membershipId: string) {
  const { supabase } = await requireUser();
  await supabase
    .from("club_members")
    .update({ status: "rejected" })
    .eq("id", membershipId);
  revalidatePath(`/admin/clubs/${clubId}`);
}
