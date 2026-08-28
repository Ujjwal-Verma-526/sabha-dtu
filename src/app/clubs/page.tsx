import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClubCard } from "@/components/clubs/ClubCard";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Clubs — Sabha",
  description: "Browse verified DTU societies on Sabha.",
};

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;

  const supabase = await createClient();

  // Public directory: only verified clubs, regardless of who's viewing —
  // draft/unverified clubs are an admin concern, not a directory listing.
  let query = supabase
    .from("clubs")
    .select("slug, name, category, description, logo_url, verified")
    .eq("verified", true)
    .order("name");

  if (q) {
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  }
  if (category) {
    query = query.eq("category", category);
  }

  const [{ data: clubs }, { data: allVerified }] = await Promise.all([
    query,
    supabase.from("clubs").select("category").eq("verified", true),
  ]);

  const categories = Array.from(
    new Set((allVerified ?? []).map((c) => c.category).filter(Boolean)),
  ) as string[];

  return (
    <main className="mx-auto max-w-6xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl font-bold text-ink">Clubs</h1>
      <p className="mt-2 text-ink-soft">
        DTU societies, verified and listed by the Sabha team.
      </p>

      <form method="get" className="mt-8 flex gap-3">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search clubs…"
          className="w-full max-w-sm rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        />
        {category && <input type="hidden" name="category" value={category} />}
        <button
          type="submit"
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-primary"
        >
          Search
        </button>
      </form>

      {categories.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={q ? `/clubs?q=${encodeURIComponent(q)}` : "/clubs"}
            className={cn(
              "rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wide",
              !category
                ? "border-primary bg-primary/10 text-primary"
                : "border-line text-ink-soft hover:border-primary",
            )}
          >
            All
          </Link>
          {categories.map((c) => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            params.set("category", c);
            return (
              <Link
                key={c}
                href={`/clubs?${params.toString()}`}
                className={cn(
                  "rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wide",
                  category === c
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-line text-ink-soft hover:border-primary",
                )}
              >
                {c}
              </Link>
            );
          })}
        </div>
      )}

      {clubs && clubs.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((club) => (
            <ClubCard key={club.slug} club={club} />
          ))}
        </div>
      ) : (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <p className="font-display text-lg font-semibold text-ink">
            No clubs match yet.
          </p>
          <p className="max-w-sm text-sm text-ink-soft">
            {q || category
              ? "Try a different search or clear the filter."
              : "Verified DTU societies will show up here once they're added."}
          </p>
        </div>
      )}
    </main>
  );
}
