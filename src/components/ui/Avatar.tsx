import { avatarSrc, personInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

/**
 * A person's photo in a circle, or their initials on a neutral one. Only a
 * photo in that person's own folder of our avatars bucket is shown (see
 * src/lib/avatar.ts); any other avatar_url, such as an old external link,
 * gets initials. Decorative: the name is always written next to it.
 *
 * Size it with className (h-, w- and a text size for the initials).
 */
export function Avatar({
  name,
  avatarUrl,
  userId,
  className,
}: {
  name: string | null | undefined;
  avatarUrl: string | null | undefined;
  userId: string;
  className?: string;
}) {
  const src = avatarSrc(avatarUrl, userId);
  if (src) {
    return (
      // A public object in our own storage; next/image isn't set up for it
      // (same as club logos).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        decoding="async"
        className={cn("shrink-0 rounded-full bg-soft object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-soft font-semibold text-ink-soft select-none",
        className,
      )}
    >
      {personInitials(name)}
    </span>
  );
}
