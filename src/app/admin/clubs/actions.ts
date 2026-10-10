"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  actionError,
  actionSuccess,
  idleState,
  type ActionState,
} from "@/lib/action-state";
import {
  NOT_ALLOWED_MESSAGE,
  friendlyDbError,
  isForeignKeyViolation,
  isRaisedException,
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
export async function updateClub(
  clubId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("clubs")
    .update({
      description: readText(formData, "description") || null,
      logo_url: readText(formData, "logo_url") || null,
      category: readText(formData, "category") || null,
      instagram_handle: readText(formData, "instagram_handle") || null,
    })
    .eq("id", clubId)
    .select("id");

  if (error) {
    return actionError(friendlyDbError(error, "updating a club"));
  }
  if (data.length === 0) {
    return actionError(NOT_ALLOWED_MESSAGE);
  }

  revalidatePath(`/admin/clubs/${clubId}`);
  revalidatePath("/clubs");
  return actionSuccess("Changes saved.");
}

// Only a super_admin's UPDATE actually changes `verified` — the
// prevent_club_protected_field_changes trigger rejects anyone else's
// attempt (it raises, which surfaces here as a raised exception).
export async function setClubVerified(
  clubId: string,
  verified: boolean,
  _previousState: ActionState,
): Promise<ActionState> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("clubs")
    .update({ verified })
    .eq("id", clubId)
    .select("id");

  if (error) {
    const message = friendlyDbError(error, "changing club verification");
    return actionError(
      isRaisedException(error)
        ? "Only a Sabha super admin can change verification."
        : message,
    );
  }
  if (data.length === 0) {
    return actionError(NOT_ALLOWED_MESSAGE);
  }

  revalidatePath(`/admin/clubs/${clubId}`);
  revalidatePath("/admin/clubs");
  revalidatePath("/clubs");
  // The page re-renders with the new verified state, which is the confirmation.
  return idleState;
}

async function setMembershipStatus(
  clubId: string,
  membershipId: string,
  status: "approved" | "rejected",
): Promise<ActionState> {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("club_members")
    .update({ status })
    .eq("id", membershipId)
    .eq("club_id", clubId)
    .select("id");

  if (error) {
    return actionError(friendlyDbError(error, `marking a membership ${status}`));
  }
  if (data.length === 0) {
    return actionError(NOT_ALLOWED_MESSAGE);
  }

  // The request leaves the pending list when the page re-renders.
  revalidatePath(`/admin/clubs/${clubId}`);
  return idleState;
}

export async function approveMembership(
  clubId: string,
  membershipId: string,
  _previousState: ActionState,
): Promise<ActionState> {
  return setMembershipStatus(clubId, membershipId, "approved");
}

export async function rejectMembership(
  clubId: string,
  membershipId: string,
  _previousState: ActionState,
): Promise<ActionState> {
  return setMembershipStatus(clubId, membershipId, "rejected");
}
