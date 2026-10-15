import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClubCard } from "@/components/clubs/ClubCard";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { toIlikeSearchTerm } from "@/lib/search";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Clubs — Sabha",
  description: "Browse verified DTU societies on Sabha.",
};

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[] }>;
}) {
  // A repeated parameter (?q=a&q=b) arrives as an array; use the first.
  const raw = await searchParams;
  const q = [raw.q].flat()[0];
  const category = [raw.category].flat()[0];

  const supabase = await createClient();

  // Public directory: only verified clubs, regardless of who's viewing —
  // draft/unverified clubs are an admin concern, not a directory listing.
  let query = supabase
    .from("clubs")
    .select("slug, name, category, description, logo_url, verified")
    .eq("verified", true)
    .order("name");

  // q goes inside PostgREST's or=(...) syntax, so it is neutralised first.
  const term = q ? toIlikeSearchTerm(q) : null;
  if (term) {
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
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

  const chipClass = (on: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium transition-colors",
      on ? "bg-ink text-paper" : "bg-soft text-ink hover:bg-line",
    );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 md:px-8 md:pt-11">
      <PageHeader
        title="Clubs"
        description="DTU societies, verified and listed by the Sabha team."
      />

      <form method="get" role="search" className="mt-6 flex max-w-md gap-2">
        <label htmlFor="club-search" className="sr-only">
          Search clubs
        </label>
        <Input
          id="club-search"
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search clubs"
          className="min-w-0 flex-1"
        />
        {category && <input type="hidden" name="category" value={category} />}
        <Button type="submit" variant="ghost" className="min-h-12 shrink-0">
          Search
        </Button>
      </form>

      {categories.length > 0 && (
        <div
          role="group"
          aria-label="Filter by category"
          className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
        >
          <Link
            href={q ? `/clubs?q=${encodeURIComponent(q)}` : "/clubs"}
            aria-current={!category ? "true" : undefined}
            className={chipClass(!category)}
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
                aria-current={category === c ? "true" : undefined}
                className={chipClass(category === c)}
              >
                {c}
              </Link>
            );
          })}
        </div>
      )}

      {clubs && clubs.length > 0 ? (
        <div className="mt-4 grid md:grid-cols-2 md:gap-x-12">
          {clubs.map((club) => (
            <ClubCard key={club.slug} club={club} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="clubs"
          title={q || category ? "No clubs match" : "No clubs yet"}
          className="mt-8"
          action={
            (q || category) && (
              <ButtonLink href="/clubs" variant="soft">
                Clear search
              </ButtonLink>
            )
          }
        >
          {q || category
            ? "Try a different search or clear the filter."
            : "Verified DTU societies will show up here once they're added."}
        </EmptyState>
      )}
    </main>
  );
}
