import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { updateProfile, signOut } from "./actions";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // The handle_new_auth_user trigger creates this row the instant
    // auth.users gets a new row, so this should be unreachable — surface
    // it plainly rather than silently rendering a broken form.
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-24 text-center">
        <p className="text-ink-soft">
          No profile found for this account yet. Try signing out and back
          in.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">
          Your profile
        </h1>
        <form action={signOut}>
          <SubmitButton variant="ghost" className="text-sm">
            Sign out
          </SubmitButton>
        </form>
      </div>

      <Card className="mt-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-display font-semibold text-ink">My tickets</p>
          <p className="text-sm text-ink-soft">
            QR tickets for events you&apos;ve registered for.
          </p>
        </div>
        <ButtonLink href="/tickets" variant="accent" className="shrink-0">
          View tickets
        </ButtonLink>
      </Card>

      <Card className="mt-6">
        <p className="text-sm text-ink-soft">
          Signed in as <span className="font-mono text-ink">{profile.email}</span>
        </p>

        <ProfileForm
          action={updateProfile}
          initialValues={{
            name: profile.name,
            roll_number: profile.roll_number ?? "",
            branch: profile.branch ?? "",
            batch_year: profile.batch_year?.toString() ?? "",
            avatar_url: profile.avatar_url ?? "",
          }}
        />
      </Card>
    </main>
  );
}
