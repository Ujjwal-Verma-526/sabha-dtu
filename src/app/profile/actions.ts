"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  revalidatePath("/profile");
  return { error: null, fieldErrors: {}, values, saved: true };
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
