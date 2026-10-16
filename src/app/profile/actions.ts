"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AVATAR_BUCKET, avatarFileName } from "@/lib/avatar";
import { NOT_ALLOWED_MESSAGE, friendlyDbError } from "@/lib/db-errors";
import {
  readProfileValues,
  validateProfile,
  type ProfileFormState,
} from "@/lib/profile-form";
import { createClient } from "@/lib/supabase/server";

// Only the fields in ProfileUpdate are ever written from this form. `role`
// is never accepted here, and even if a caller forged one in, the users
// table's UPDATE policy plus the prevent_user_privilege_escalation trigger
// would still reject it — this allowlist is belt, RLS+trigger is suspenders.
export async function updateProfile(
  _previousState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const values = readProfileValues(formData);
  const failWith = (
    fieldErrors: ProfileFormState["fieldErrors"],
    error: string | null = null,
  ): ProfileFormState => ({ error, fieldErrors, values, saved: false });

  const validation = validateProfile(values);
  if (!validation.ok) {
    return failWith(validation.fieldErrors);
  }

  // .select("id") because RLS turns a blocked UPDATE into zero matched rows,
  // not an error.
  const { data, error } = await supabase
    .from("users")
    .update(validation.update)
    .eq("id", user.id)
    .select("id");

  if (error) {
    return failWith({}, friendlyDbError(error, "updating a profile"));
  }
  if (data.length === 0) {
    return failWith({}, NOT_ALLOWED_MESSAGE);
  }

  // The header's initials come from the name.
  revalidatePath("/", "layout");
  return { error: null, fieldErrors: {}, values, saved: true };
}

export type ProfilePhotoResult =
  | { ok: true; avatarUrl: string | null }
  | { ok: false; error: string };

/**
 * Saves (or, with null, removes) the profile photo, straight away and apart
 * from the details form. `url` comes from the browser after it uploaded the
 * file to the user's own folder in the avatars bucket; it is only stored if
 * it is exactly such a URL and that file is really there. Afterwards every
 * other file in the folder (the previous photo, uploads that were never
 * saved) is removed. All of it runs as the user, under the bucket's
 * owner-only policies and users' own-row UPDATE policy.
 */
export async function setProfilePhoto(url: string | null): Promise<ProfilePhotoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (url !== null && typeof url !== "string") {
    return { ok: false, error: "That photo couldn't be saved. Try uploading it again." };
  }
  const keep = url === null ? null : avatarFileName(url, user.id);
  if (url !== null && !keep) {
    return { ok: false, error: "That photo couldn't be saved. Try uploading it again." };
  }

  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const { data: files, error: listError } = await bucket.list(user.id, { limit: 1000 });
  if (listError) {
    console.error("setProfilePhoto: listing the avatar folder failed", listError.message);
    return { ok: false, error: "Your photo couldn't be saved right now. Try again in a moment." };
  }
  if (keep && !files.some((file) => file.name === keep)) {
    return { ok: false, error: "That upload wasn't found. Try uploading it again." };
  }

  // .select("id") because RLS turns a blocked UPDATE into zero matched rows,
  // not an error.
  const { data, error } = await supabase
    .from("users")
    .update({ avatar_url: url })
    .eq("id", user.id)
    .select("id");
  if (error) {
    return { ok: false, error: friendlyDbError(error, "updating a profile") };
  }
  if (data.length === 0) {
    return { ok: false, error: NOT_ALLOWED_MESSAGE };
  }

  // Housekeeping only: the photo is saved either way, and the next save
  // tries again.
  const stale = files.filter((file) => file.name !== keep).map((file) => `${user.id}/${file.name}`);
  if (stale.length > 0) {
    const { error: removeError } = await bucket.remove(stale);
    if (removeError) {
      console.error("setProfilePhoto: removing old photos failed", removeError.message);
    }
  }

  // The header shows the photo on every page.
  revalidatePath("/", "layout");
  return { ok: true, avatarUrl: url };
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(`Could not sign out: ${error.message}`);
  }
  // The header lives in the root layout; drop every cached render so no page
  // keeps showing the signed-in state.
  revalidatePath("/", "layout");
  redirect("/");
}
