import { isOurStorageImageUrl, storagePublicPrefix } from "@/lib/storage-url";

/**
 * The one rule for profile photos, shared by the uploader, the save action
 * and every place that shows one.
 *
 * Photos live in the public `avatars` bucket at "{user_id}/{file}", and the
 * bucket's policies let only that user write there
 * (supabase/migrations/20260905000001_avatar_storage.sql). users.avatar_url
 * itself only has to be a web link of at most 500 characters (its CHECKs in
 * 20260901000001), so older rows may hold any external URL, and a direct API
 * PATCH could point one at someone else's photo. Neither is ever shown: a
 * photo is only rendered when its URL is a public object in our own storage,
 * in the avatars bucket, inside that same user's folder. Anything else shows
 * initials.
 */

export const AVATAR_BUCKET = "avatars";

/** Longest side after compression; the largest avatar is shown at 80 px. */
export const AVATAR_MAX_DIMENSION = 512;

// The uploader names files "{uuid}.jpg"; this also allows the other types
// the bucket accepts, but never a further folder or anything odd.
const AVATAR_FILE_NAME = /^[A-Za-z0-9_-]{1,100}\.(?:jpe?g|png|webp)$/;

/** A fresh object path for a new upload by `userId`. */
export function newAvatarPath(userId: string): string {
  return `${userId}/${crypto.randomUUID()}.jpg`;
}

/**
 * The file name inside `userId`'s folder that `url` points at, or null if
 * `url` isn't one of that user's photos in our own avatars bucket.
 */
export function avatarFileName(url: string, userId: string): string | null {
  if (!userId || !isOurStorageImageUrl(url)) return null;
  const prefix = `${storagePublicPrefix()}${AVATAR_BUCKET}/${userId}/`;
  if (!url.startsWith(prefix)) return null;
  const fileName = url.slice(prefix.length);
  return AVATAR_FILE_NAME.test(fileName) ? fileName : null;
}

/** `url` if it may be shown as `userId`'s photo, otherwise null (initials). */
export function avatarSrc(url: string | null | undefined, userId: string): string | null {
  return url && avatarFileName(url, userId) ? url : null;
}

/**
 * One or two letters for someone without a photo: the first letters of the
 * first and last words of their name ("Asha Rani Gupta" → "AG"), or "?" if
 * the name has no letters to use.
 */
export function personInitials(name: string | null | undefined): string {
  const letters = (name ?? "")
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((letter): letter is string => Boolean(letter));
  if (letters.length === 0) return "?";
  const initials = letters.length > 1 ? letters[0] + letters[letters.length - 1] : letters[0];
  return initials.toLocaleUpperCase();
}
