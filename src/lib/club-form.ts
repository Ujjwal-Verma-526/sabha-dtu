/**
 * Shapes and rules shared by the club forms (new club, club details) and
 * their server actions.
 *
 * The database is the source of truth for every limit here: these mirror the
 * CHECK constraints in
 * supabase/migrations/20260902000001_security_hardening.sql so the form can
 * explain a problem beside the field. Change both together. Image URLs follow
 * src/lib/storage-url.ts.
 */

import { imageUrlError, isOurStorageImageUrl } from "@/lib/storage-url";

/** Mirrors clubs_instagram_handle_format. */
const INSTAGRAM_HANDLE_PATTERN = /^@?[A-Za-z0-9._]{1,30}$/;

export const INSTAGRAM_HANDLE_ERROR =
  "Use 1–30 letters, numbers, dots or underscores, with or without a leading @.";

/** A field error for the handle, or undefined if it's fine (or empty). */
export function instagramHandleError(value: string): string | undefined {
  if (!value || INSTAGRAM_HANDLE_PATTERN.test(value)) return undefined;
  return INSTAGRAM_HANDLE_ERROR;
}

export type ClubDetailsValues = {
  category: string;
  description: string;
  logo_url: string;
  instagram_handle: string;
};

export type ClubDetailsFieldName = "logo_url" | "instagram_handle";

export type ClubDetailsState = {
  /** Form-level error not tied to one field. */
  error: string | null;
  fieldErrors: Partial<Record<ClubDetailsFieldName, string>>;
  /** What the user submitted, so the form can keep it after an error. */
  values: ClubDetailsValues;
  /** True after a successful save. */
  saved: boolean;
};

export type ClubDetailsUpdate = {
  category: string | null;
  description: string | null;
  logo_url: string | null;
  instagram_handle: string | null;
};

export function readClubDetailsValues(formData: FormData): ClubDetailsValues {
  const read = (key: keyof ClubDetailsValues) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  return {
    category: read("category"),
    description: read("description"),
    logo_url: read("logo_url"),
    instagram_handle: read("instagram_handle"),
  };
}

export type ClubDetailsValidation =
  | { ok: true; update: ClubDetailsUpdate }
  | { ok: false; fieldErrors: ClubDetailsState["fieldErrors"] };

export function validateClubDetails(
  values: ClubDetailsValues,
): ClubDetailsValidation {
  const fieldErrors: ClubDetailsState["fieldErrors"] = {};

  const handleError = instagramHandleError(values.instagram_handle);
  if (handleError) fieldErrors.instagram_handle = handleError;

  if (values.logo_url && !isOurStorageImageUrl(values.logo_url)) {
    fieldErrors.logo_url = imageUrlError(values.logo_url);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    update: {
      category: values.category || null,
      description: values.description || null,
      logo_url: values.logo_url || null,
      instagram_handle: values.instagram_handle || null,
    },
  };
}

/**
 * The field error for a clubs CHECK violation, found by the constraint name in
 * the error message, or null for any other error. Only reachable if the
 * checks above and the CHECKs drift apart.
 */
export function clubCheckFieldErrors(
  message: string,
  logoUrl: string,
): ClubDetailsState["fieldErrors"] | null {
  if (message.includes("clubs_instagram_handle_format")) {
    return { instagram_handle: INSTAGRAM_HANDLE_ERROR };
  }
  if (message.includes("clubs_logo_url_")) {
    return { logo_url: imageUrlError(logoUrl) };
  }
  return null;
}
