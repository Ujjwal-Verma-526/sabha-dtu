import Link from "next/link";
import { ClubLogo } from "./ClubLogo";
import { VerifiedBadge } from "./VerifiedBadge";

export function ClubCard({
  club,
}: {
  club: {
    slug: string;
    name: string;
    category: string | null;
    description: string | null;
    logo_url: string | null;
    verified: boolean;
  };
}) {
  return (
    <Link
      href={`/clubs/${club.slug}`}
      className="group flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-primary"
    >
      <div className="flex items-start gap-3">
        <ClubLogo
          name={club.name}
          logoUrl={club.logo_url}
          className="h-12 w-12 shrink-0 text-base"
        />
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold text-ink group-hover:text-primary">
            {club.name}
          </h3>
          {club.category && (
            <p className="font-mono text-xs uppercase tracking-wide text-ink-soft">
              {club.category}
            </p>
          )}
        </div>
      </div>

      {club.description && (
        <p className="line-clamp-2 text-sm text-ink-soft">
          {club.description}
        </p>
      )}

      {club.verified && <VerifiedBadge className="self-start" />}
    </Link>
  );
}
