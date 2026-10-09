"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  friendlyDbError,
  isForeignKeyViolation,
  isUniqueViolation,
} from "@/lib/db-errors";
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

export type CreateClubValues = {
  name: string;
  category: string;
  description: string;
  instagram_handle: string;
  admin_user_id: string;
  verified: boolean;
};

// Returned to the form (via useActionState) instead of redirecting, so the
// error shows next to the offending field and what the admin typed is kept.
export type CreateClubState = {
  /** Form-level error not tied to one field. */
  error: string | null;
  fieldErrors: { name?: string; admin_user_id?: string };
  values: CreateClubValues;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// Page-level guards already keep non-super-admins away from this form —
// this check just avoids a confusing silent no-op for a direct POST.
// The clubs_insert_super_admin RLS policy is what actually enforces it.
export async function createClub(
  _previousState: CreateClubState,
  formData: FormData,
): Promise<CreateClubState> {
  const { supabase, user } = await requireUser();

  const values: CreateClubValues = {
    name: readText(formData, "name"),
    category: readText(formData, "category"),
    description: readText(formData, "description"),
    instagram_handle: readText(formData, "instagram_handle"),
    admin_user_id: readText(formData, "admin_user_id"),
    verified: formData.get("verified") === "on",
  };
  const failWith = (
    fieldErrors: CreateClubState["fieldErrors"],
    error: string | null = null,
  ): CreateClubState => ({ error, fieldErrors, values });

  if (!values.name) {
    return failWith({ name: "Name is required." });
  }
  const slug = slugify(values.name);
  if (!slug) {
    return failWith({ name: "Name needs at least one letter or number." });
  }
  if (values.admin_user_id && !UUID_PATTERN.test(values.admin_user_id)) {
    return failWith({
      admin_user_id: "That doesn't look like a valid user ID.",
    });
  }

  const { data: club, error } = await supabase
    .from("clubs")
    .insert({
      name: values.name,
      slug,
      description: values.description || null,
      category: values.category || null,
      instagram_handle: values.instagram_handle || null,
      created_by: values.admin_user_id || user.id,
      verified: values.verified,
    })
    .select("id")
    .single();

  if (error) {
    // clubs.slug is unique, and the slug is derived from the name.
    if (isUniqueViolation(error)) {
      return failWith({
        name: "A club with this URL already exists. Try a different name.",
      });
    }
    // The only foreign key on this insert that the form controls is created_by.
    if (isForeignKeyViolation(error)) {
      return failWith({ admin_user_id: "No user with that ID exists." });
    }
    return failWith({}, friendlyDbError(error, "creating a club"));
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
