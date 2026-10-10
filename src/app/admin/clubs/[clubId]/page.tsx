import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { ButtonLink } from "@/components/ui/Button";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  updateClub,
  setClubVerified,
  approveMembership,
  rejectMembership,
} from "../actions";

export default async function AdminClubPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: club }, { data: membership }, { data: profile }] =
    await Promise.all([
      supabase
        .from("clubs")
        .select(
          "id, name, slug, description, logo_url, category, instagram_handle, verified",
        )
        .eq("id", clubId)
        .maybeSingle(),
      supabase
        .from("club_members")
        .select("role, status")
        .eq("club_id", clubId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
    ]);

  if (!club) notFound();

  const isSuperAdmin = profile?.role === "super_admin";
  const isManager =
    membership?.status === "approved" &&
    (membership.role === "admin" || membership.role === "coordinator");

  if (!isSuperAdmin && !isManager) {
    return (
      <main className="mx-auto max-w-lg flex-1 px-6 py-16 text-center">
        <p className="text-ink-soft">You don&apos;t manage this club.</p>
      </main>
    );
  }

  const { data: memberProfiles } = await supabase.rpc(
    "get_club_member_profiles",
    { target_club: clubId },
  );
  const pending = (memberProfiles ?? []).filter((m) => m.status === "pending");

  const updateWithId = updateClub.bind(null, club.id);
  const verifyOn = setClubVerified.bind(null, club.id, true);
  const verifyOff = setClubVerified.bind(null, club.id, false);

  return (
    <main className="mx-auto max-w-2xl flex-1 px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-ink">
        {club.name}
      </h1>
      <p className="mt-1 font-mono text-xs text-ink-soft">
        /clubs/{club.slug}
      </p>

      <ButtonLink
        href={`/admin/clubs/${club.id}/events`}
        variant="ghost"
        className="mt-4 text-sm"
      >
        Manage events →
      </ButtonLink>

      {isSuperAdmin && (
        <Card className="mt-6">
          <p className="text-sm font-medium text-ink">Verification</p>
          <p className="mt-1 text-sm text-ink-soft">
            {club.verified
              ? "This club is verified and visible in the public directory."
              : "This club is unverified — hidden from the public directory."}
          </p>
          <ActionForm
            action={club.verified ? verifyOff : verifyOn}
            className="mt-3"
          >
            <SubmitButton
              variant={club.verified ? "ghost" : "primary"}
              className="text-sm"
            >
              {club.verified ? "Unverify" : "Verify"}
            </SubmitButton>
          </ActionForm>
        </Card>
      )}

      <Card className="mt-6">
        <p className="text-sm font-medium text-ink">Club details</p>
        <ActionForm action={updateWithId} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Category</span>
            <Input name="category" defaultValue={club.category ?? ""} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Description</span>
            <Textarea
              name="description"
              rows={4}
              defaultValue={club.description ?? ""}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Logo URL</span>
            <Input name="logo_url" defaultValue={club.logo_url ?? ""} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Instagram handle</span>
            <Input
              name="instagram_handle"
              defaultValue={club.instagram_handle ?? ""}
            />
          </label>

          <SubmitButton variant="primary" className="mt-2" pendingLabel="Saving…">
            Save changes
          </SubmitButton>
        </ActionForm>
      </Card>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink">
          Membership requests
        </h2>
        {pending.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3">
            {pending.map((m) => {
              const approve = approveMembership.bind(null, club.id, m.membership_id);
              const reject = rejectMembership.bind(null, club.id, m.membership_id);
              return (
                <Card
                  key={m.membership_id}
                  className="flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium text-ink">{m.name}</p>
                    <p className="font-mono text-xs text-ink-soft">
                      Requested{" "}
                      {new Date(m.joined_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <ActionForm action={reject}>
                      <SubmitButton variant="ghost" className="text-sm">
                        Reject
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={approve}>
                      <SubmitButton variant="primary" className="text-sm">
                        Approve
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">
            No pending requests right now.
          </p>
        )}
      </section>
    </main>
  );
}
