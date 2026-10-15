import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { NotManager } from "@/components/layout/ManageNotice";
import { ClubLogo } from "@/components/clubs/ClubLogo";
import { VerifiedBadge } from "@/components/clubs/VerifiedBadge";
import { Icon } from "@/components/ui/Icon";
import { PageHeader, sectionHeadingClass } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { ActionForm } from "@/components/ui/ActionForm";
import { ClubDetailsForm } from "@/components/clubs/ClubDetailsForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatIstDate } from "@/lib/ist";
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
    return <NotManager />;
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
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-5 pb-16 md:px-8 md:pt-10">
      <Breadcrumbs
        items={[
          ...(isSuperAdmin ? [{ label: "Manage", href: "/admin/clubs" }] : []),
          { label: club.name },
        ]}
      />
      <div className="flex items-center gap-4">
        <ClubLogo
          name={club.name}
          logoUrl={club.logo_url}
          className="h-14 w-14 shrink-0 rounded-2xl text-lg md:h-16 md:w-16"
        />
        <PageHeader
          size="md"
          className="min-w-0 flex-1"
          title={club.name}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
              {club.verified ? <VerifiedBadge /> : <span className="font-semibold">Unverified</span>}
              <span className="break-all">/clubs/{club.slug}</span>
            </span>
          }
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <ButtonLink href={`/admin/clubs/${club.id}/events`}>
          <Icon name="calendar" />
          Events
        </ButtonLink>
        <ButtonLink href={`/clubs/${club.slug}`} variant="ghost">
          Public page
          <Icon name="arrowRight" />
        </ButtonLink>
      </div>

      {isSuperAdmin && (
        <section
          aria-labelledby="verification-heading"
          className="mt-8 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"
        >
          <div>
            <h2 id="verification-heading" className="font-semibold text-ink">
              Verification
            </h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {club.verified
                ? "This club is verified and visible in the public directory."
                : "This club is unverified, so it's hidden from the public directory."}
            </p>
          </div>
          <ActionForm action={club.verified ? verifyOff : verifyOn} className="shrink-0">
            <SubmitButton variant={club.verified ? "ghost" : "primary"}>
              {club.verified ? "Unverify" : "Verify"}
            </SubmitButton>
          </ActionForm>
        </section>
      )}

      <section aria-labelledby="requests-heading" className="mt-10">
        <h2 id="requests-heading" className={sectionHeadingClass}>
          Membership requests{pending.length > 0 && ` · ${pending.length}`}
        </h2>
        {pending.length > 0 ? (
          <ul className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
            {pending.map((m) => {
              const approve = approveMembership.bind(null, club.id, m.membership_id);
              const reject = rejectMembership.bind(null, club.id, m.membership_id);
              return (
                <li
                  key={m.membership_id}
                  className="flex flex-col gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold break-words text-ink">{m.name}</p>
                    <p className="text-[13px] text-ink-soft">
                      Requested {formatIstDate(m.joined_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <ActionForm action={reject}>
                      <SubmitButton variant="ghost" pendingLabel="Rejecting…">
                        Reject
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={approve}>
                      <SubmitButton variant="primary" pendingLabel="Approving…">
                        Approve
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">No pending requests right now.</p>
        )}
      </section>

      <section aria-labelledby="details-heading" className="mt-10 border-t border-line pt-6">
        <h2 id="details-heading" className={sectionHeadingClass}>
          Club details
        </h2>
        <ClubDetailsForm
          clubId={club.id}
          clubName={club.name}
          action={updateWithId}
          initialValues={{
            category: club.category ?? "",
            description: club.description ?? "",
            logo_url: club.logo_url ?? "",
            instagram_handle: club.instagram_handle ?? "",
          }}
        />
      </section>
    </main>
  );
}
