// Event categories: a fixed list, stored in events.category as these
// lowercase keys. The events_category_valid CHECK
// (supabase/migrations/20260904000001_event_categories.sql) allows exactly
// these; change both together. Club categories are separate free text.
//
// The colours are for event content only (posters, dots, the event page
// tint); forms, tickets and the door scanner never use them. The CSS colours
// live in globals.css (--cat-*, .poster-*).

export const CATEGORY_KEYS = [
  "technical",
  "cultural",
  "social",
  "entrepreneurship",
  "other",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  technical: "Technical",
  cultural: "Cultural",
  social: "Social",
  entrepreneurship: "Entrepreneurship",
  other: "Other",
};

export function isCategoryKey(value: unknown): value is CategoryKey {
  return CATEGORY_KEYS.some((k) => k === value);
}

/** An event's stored category as a key; anything unexpected reads as "other". */
export function categoryKey(category: string | null | undefined): CategoryKey {
  return isCategoryKey(category) ? category : "other";
}

/** Display name, e.g. "Entrepreneurship". */
export function categoryLabel(key: CategoryKey): string {
  return CATEGORY_LABELS[key];
}

/** CSS colour for a category dot or tint, e.g. `var(--cat-technical)`. */
export function categoryColor(key: CategoryKey): string {
  return `var(--cat-${key})`;
}

/** Text colour on a solid category fill (marigold needs dark text). */
export function categoryInk(key: CategoryKey): string {
  return key === "entrepreneurship" ? "#1c1326" : "#ffffff";
}

// The auto-poster's colours as literal values, for the generated share image
// (src/app/events/[slug]/poster.png), which is drawn outside CSS and can't
// read the --cat-* variables. They mirror --cat-* and .poster-* in
// globals.css (light-mode values); change both together.
const POSTER_COLORS: Record<CategoryKey, { bg: string; fg: string }> = {
  technical: { bg: "#1a5fb4", fg: "#ffffff" },
  cultural: { bg: "#c2410c", fg: "#ffffff" },
  social: { bg: "#0b7a6f", fg: "#ffffff" },
  entrepreneurship: { bg: "#ffb020", fg: "#1c1326" },
  other: { bg: "#4a4a57", fg: "#ffffff" },
};

export function categoryPosterColors(key: CategoryKey): { bg: string; fg: string } {
  return POSTER_COLORS[key];
}
