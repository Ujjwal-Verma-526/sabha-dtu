import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClubLogo } from "@/components/clubs/ClubLogo";
import { VerifiedBadge } from "@/components/clubs/VerifiedBadge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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
    return (
      <main className="mx-auto max-w-lg flex-1 px-6 py-16 text-center">
        <p className="text-ink-soft">
          This area is for Sabha super admins only.
        </p>
      </main>
    );
  }

  // super_admin: RLS returns every club regardless of verified status.
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name, slug, category, logo_url, verified")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">
          All clubs
        </h1>
        <ButtonLink href="/admin/clubs/new" variant="primary" className="text-sm">
          New club
        </ButtonLink>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {clubs && clubs.length > 0 ? (
          clubs.map((club) => (
            <Link key={club.id} href={`/admin/clubs/${club.id}`}>
              <Card className="flex items-center gap-3 transition-colors hover:border-primary">
                <ClubLogo
                  name={club.name}
                  logoUrl={club.logo_url}
                  className="h-10 w-10 shrink-0 text-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{club.name}</p>
                  <p className="font-mono text-xs text-ink-soft">
                    /clubs/{club.slug}
                    {club.category ? ` · ${club.category}` : ""}
                  </p>
                </div>
                {club.verified ? (
                  <VerifiedBadge />
                ) : (
                  <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                    Unverified
                  </span>
                )}
              </Card>
            </Link>
          ))
        ) : (
          <p className="text-sm text-ink-soft">No clubs yet.</p>
        )}
      </div>
    </main>
  );
}
