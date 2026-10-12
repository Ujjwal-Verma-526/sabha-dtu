/**
 * The one rule for image URLs stored on clubs and events (club logo_url,
 * event banner_url), shared by their forms and server actions.
 *
 * The database is the source of truth for the shape: clubs_logo_url_* and
 * events_banner_url_* in
 * supabase/migrations/20260902000001_security_hardening.sql allow null, or at
 * most 500 characters starting with https:// (plus the local stack's http://
 * storage URL). Change both together.
 *
 * The forms go further than the database can: the image must be a public
 * object in this project's own Supabase storage, so a manager can't point a
 * logo or banner at a tracking pixel or someone else's host.
 */

/** Mirrors clubs_logo_url_length and events_banner_url_length. */
export const IMAGE_URL_MAX_LENGTH = 500;

const PUBLIC_OBJECT_PATH = "/storage/v1/object/public/";

/**
 * `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`, the prefix every
 * getPublicUrl() result starts with. Null if the env value is missing or
 * invalid, in which case no URL is accepted.
 */
export function storagePublicPrefix(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  try {
    const { origin } = new URL(base);
    return `${origin}${PUBLIC_OBJECT_PATH}`;
  } catch {
    return null;
  }
}

/**
 * True if `value` is a public object URL in our own Supabase storage, within
 * the length limit. The raw string must start with the prefix (so the
 * database's https:// check holds), and the parsed URL must still be on the
 * same origin and under the public object path once `..` and the like are
 * resolved.
 */
export function isOurStorageImageUrl(value: string): boolean {
  const prefix = storagePublicPrefix();
  if (!prefix || value.length > IMAGE_URL_MAX_LENGTH) return false;
  if (!value.startsWith(prefix) || value.length === prefix.length) return false;
  try {
    const url = new URL(value);
    const expected = new URL(prefix);
    return (
      url.origin === expected.origin &&
      url.pathname.startsWith(PUBLIC_OBJECT_PATH) &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

/** Field error for a URL that fails isOurStorageImageUrl. */
export function imageUrlError(value: string): string {
  if (value.length > IMAGE_URL_MAX_LENGTH) {
    return `Keep this under ${IMAGE_URL_MAX_LENGTH} characters.`;
  }
  const prefix = storagePublicPrefix();
  return prefix
    ? `Use an image stored in Sabha's storage: the link must start with ${prefix}`
    : "Image links can't be checked right now. Leave this empty and try again later.";
}
