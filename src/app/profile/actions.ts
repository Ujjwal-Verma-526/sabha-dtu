"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Only these fields are ever written from this form. `role` is never
// accepted here, and even if a caller forged one in, the users table's
// UPDATE policy plus the prevent_user_privilege_escalation trigger would
// still reject it — this allowlist is belt, RLS+trigger is suspenders.
export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const batchYearRaw = formData.get("batch_year");
  const batchYear =
    typeof batchYearRaw === "string" && batchYearRaw.trim() !== ""
      ? Number(batchYearRaw)
      : null;

  const { error } = await supabase
    .from("users")
    .update({
      name: String(formData.get("name") ?? ""),
      roll_number: (formData.get("roll_number") as string) || null,
      branch: (formData.get("branch") as string) || null,
      batch_year: batchYear,
      avatar_url: (formData.get("avatar_url") as string) || null,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/profile");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
