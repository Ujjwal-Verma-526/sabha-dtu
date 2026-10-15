import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClubLogo } from "@/components/clubs/ClubLogo";
import { VerifiedBadge } from "@/components/clubs/VerifiedBadge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { NotSuperAdmin } from "@/components/layout/ManageNotice";

export default async function AdminClubsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "super_admin") {
    return <NotSuperAdmin />;
  }

  // super_admin: RLS returns every club regardless of verified status.
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, slug, category, logo_url, verified")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-16 md:px-8 md:pt-10">
      <Breadcrumbs items={[{ label: "Manage" }]} />
      <PageHeader
        size="md"
        title="All clubs"
        description="Every club on Sabha, newest first. Unverified clubs are hidden from the directory."
        actions={
          <ButtonLink href="/admin/clubs/new">
            <Icon name="plus" strokeWidth={2.2} />
            New club
          </ButtonLink>
        }
      />

      {clubs && clubs.length > 0 ? (
        <ul className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
          {clubs.map((club) => (
            <li key={club.id} className="border-b border-line last:border-b-0">
              <Link
                href={`/admin/clubs/${club.id}`}
                className="group flex items-center gap-3 px-4 py-3.5 hover:bg-soft"
              >
                <ClubLogo
                  name={club.name}
                  logoUrl={club.logo_url}
                  className="h-10 w-10 shrink-0 text-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink group-hover:text-primary">
                    {club.name}
                  </p>
                  <p className="truncate text-[13px] text-ink-soft">
                    /clubs/{club.slug}
                    {club.category ? ` · ${club.category}` : ""}
                  </p>
                </div>
                {club.verified ? (
                  <VerifiedBadge className="shrink-0" />
                ) : (
                  <span className="shrink-0 rounded-full border border-control px-2.5 py-0.5 text-[13px] font-semibold text-ink-soft">
                    Unverified
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon="clubs"
          title="No clubs yet"
          className="mt-6"
          action={<ButtonLink href="/admin/clubs/new">New club</ButtonLink>}
        >
          Add the first DTU society to get Sabha started.
        </EmptyState>
      )}
    </main>
  );
}
