import { cn } from "@/lib/utils";

const FILLER = new Set(["the", "of", "and", "&", "for", "at"]);

/**
 * Up to two letters for a club without a logo. Only the name before a comma
 * counts ("Madhurima, the Music Society" → "M"), filler words are skipped,
 * and an all-caps first word is an acronym that gives its own first letters
 * ("IEEE DTU" → "IE", not "ID"); otherwise the first letters of the first
 * two words.
 */
export function clubMonogram(name: string) {
  const words = (name.split(",")[0] ?? name)
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w.toLowerCase()));
  const first = words[0] ?? "";
  if (/^[A-Z0-9]{2,}$/.test(first)) return first.slice(0, 2);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function ClubLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // External, unpredictable club-supplied URLs — no remote pattern to configure yet.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={cn("rounded-xl object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-primary-soft font-semibold text-primary-soft-ink",
        className,
      )}
      aria-hidden
    >
      {clubMonogram(name) || "?"}
    </div>
  );
}
