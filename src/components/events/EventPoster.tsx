import { categoryColor, type CategoryKey } from "@/lib/categories";
import { cn } from "@/lib/utils";

/** The part of a title worth putting on a poster: "PCB Design Workshop: From…" → "PCB Design Workshop". */
function posterTitle(title: string) {
  const head = title.split(":")[0]?.trim();
  return head || title;
}

/**
 * The club's banner if there is one; otherwise an auto-poster in the
 * category colour, so an event without art still looks deliberate.
 * Size it with className (it fills its box); `size` tunes the type.
 */
export function EventPoster({
  title,
  clubName,
  bannerUrl,
  category,
  size,
  className,
}: {
  title: string;
  clubName: string;
  bannerUrl: string | null;
  category: CategoryKey;
  size: "thumb" | "card" | "hero";
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-soft", className)}>
      {bannerUrl ? (
        // Club-supplied banner URLs — no remote pattern to configure yet,
        // same reasoning as ClubLogo.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div aria-hidden="true" data-size={size} className={`poster-auto poster-${category}`}>
          {size !== "thumb" && <span className="poster-club">{clubName}</span>}
          <span className="poster-title">{posterTitle(title)}</span>
        </div>
      )}
    </div>
  );
}

export function CategoryDot({
  category,
  className,
}: {
  category: CategoryKey;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: categoryColor(category) }}
    />
  );
}
