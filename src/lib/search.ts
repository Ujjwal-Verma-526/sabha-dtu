/** Longest search term passed on to the database. */
export const SEARCH_MAX_LENGTH = 100;

/**
 * Characters with a meaning inside a PostgREST `or=(...)` ilike filter:
 * , ( ) separate and group conditions, " quotes, \ escapes, . and : separate
 * column, operator and value, and % _ * are LIKE wildcards (* is PostgREST's
 * alias for %). Without this, a search for `x%,verified.eq.false` would add a
 * condition of its own.
 */
const FILTER_SYNTAX = /[,()"\\.:%_*]/g;

/**
 * Makes free text safe to put inside an `ilike` value of a PostgREST `.or()`
 * filter. Each reserved character becomes `_`, LIKE's one-character wildcard,
 * so the term can't change the filter's structure but "B.Tech" still finds
 * "B.Tech". Whitespace is collapsed and the term is capped at
 * SEARCH_MAX_LENGTH. Returns null when nothing searchable is left.
 */
export function toIlikeSearchTerm(raw: string): string | null {
  const term = raw
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_LENGTH)
    .replace(FILTER_SYNTAX, "_");
  return term && /[^_ ]/.test(term) ? term : null;
}
