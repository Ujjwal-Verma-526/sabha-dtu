import Link from "next/link";
import { ClubLogo } from "./ClubLogo";
import { VerifiedBadge } from "./VerifiedBadge";

/** One society in the /clubs directory: logo, name with the verified tick, category, blurb. */
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
      className="group flex items-start gap-3.5 border-b border-line py-4"
    >
      <ClubLogo
        name={club.name}
        logoUrl={club.logo_url}
        className="h-12 w-12 shrink-0 text-base"
      />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-semibold tracking-[-0.01em] text-ink group-hover:text-primary">
            {club.name}
          </span>
          {club.verified && <VerifiedBadge label={false} />}
        </p>
        {club.category && <p className="text-[13px] text-ink-soft">{club.category}</p>}
        {club.description && (
          <p className="mt-1 line-clamp-2 text-[13.5px] text-ink-soft">{club.description}</p>
        )}
      </div>
    </Link>
  );
}
