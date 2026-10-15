import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NoticePage } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader, sectionHeadingClass } from "@/components/ui/PageHeader";
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
      <NoticePage
        icon="user"
        title="No profile found"
        action={
          <form action={signOut}>
            <SubmitButton variant="ghost" pendingLabel="Signing out…">
              Sign out
            </SubmitButton>
          </form>
        }
      >
        No profile found for this account yet. Try signing out and back in.
      </NoticePage>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-6 pb-16 md:pt-11">
      <PageHeader
        title="Profile"
        description={
          <>
            Signed in as <span className="font-medium break-all text-ink">{profile.email}</span>
          </>
        }
      />

      <Link
        href="/tickets"
        className="group mt-6 flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-control"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-[22px] text-primary-soft-ink">
          <Icon name="ticket" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink group-hover:text-primary">My tickets</span>
          <span className="block text-[13.5px] text-ink-soft">
            QR tickets for events you&apos;ve registered for.
          </span>
        </span>
        <Icon name="arrowRight" className="text-xl text-ink-soft" />
      </Link>

      <section aria-labelledby="details-heading" className="mt-10">
        <h2 id="details-heading" className={sectionHeadingClass}>
          Your details
        </h2>
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
      </section>

      <section aria-labelledby="account-heading" className="mt-10 border-t border-line pt-6">
        <h2 id="account-heading" className={sectionHeadingClass}>
          Account
        </h2>
        <p className="mt-1 text-sm text-ink-soft">Sign out of Sabha on this device.</p>
        <form action={signOut} className="mt-3">
          <SubmitButton variant="ghost" pendingLabel="Signing out…">
            Sign out
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
