// Display colours for event categories. Event content only (posters, dots,
// the event page tint); forms, tickets and the door scanner never use them.
// The CSS colours live in globals.css (--cat-*, .poster-*).
//
// Until events have their own fixed category, the club's free-text
// category picks the colour: one of the five names (any case) or "other".

export const CATEGORY_KEYS = [
  "technical",
  "cultural",
  "social",
  "entrepreneurship",
  "other",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export function categoryKey(category: string | null | undefined): CategoryKey {
  const key = category?.trim().toLowerCase();
  return CATEGORY_KEYS.find((k) => k === key) ?? "other";
}

/** CSS colour for a category dot or tint, e.g. `var(--cat-technical)`. */
export function categoryColor(key: CategoryKey): string {
  return `var(--cat-${key})`;
}

/** Text colour on a solid category fill (marigold needs dark text). */
export function categoryInk(key: CategoryKey): string {
  return key === "entrepreneurship" ? "#1c1326" : "#ffffff";
}
