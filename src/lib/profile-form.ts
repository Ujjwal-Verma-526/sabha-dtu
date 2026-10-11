/**
 * Shapes and rules shared by the /profile form and the updateProfile server
 * action. The limits live here, once, so the inputs' attributes and the
 * server-side checks can't drift apart.
 */

/** Matches the users_batch_year_range CHECK constraint (2000..2100). */
export const BATCH_YEAR_MIN = 2000;
export const BATCH_YEAR_MAX = 2100;

export const PROFILE_MAX_LENGTH = {
  name: 100,
  roll_number: 30,
  branch: 100,
  avatar_url: 500,
} as const;

export type ProfileFormValues = {
  name: string;
  roll_number: string;
  branch: string;
  batch_year: string;
  avatar_url: string;
};

export type ProfileFieldName = keyof ProfileFormValues;

export type ProfileFormState = {
  /** Form-level error not tied to one field. */
  error: string | null;
  fieldErrors: Partial<Record<ProfileFieldName, string>>;
  /** What the user submitted, so the form can keep it after an error. */
  values: ProfileFormValues;
  /** True after a successful save. */
  saved: boolean;
};

export type ProfileUpdate = {
  name: string;
  roll_number: string | null;
  branch: string | null;
  batch_year: number | null;
  avatar_url: string | null;
};

function readText(formData: FormData, key: ProfileFieldName): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function readProfileValues(formData: FormData): ProfileFormValues {
  return {
    name: readText(formData, "name"),
    roll_number: readText(formData, "roll_number"),
    branch: readText(formData, "branch"),
    batch_year: readText(formData, "batch_year"),
    avatar_url: readText(formData, "avatar_url"),
  };
}

/** Only web links: a stored `javascript:` or `data:` URL is an XSS vector the day it is rendered. */
function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export type ProfileValidation =
  | { ok: true; update: ProfileUpdate }
  | { ok: false; fieldErrors: ProfileFormState["fieldErrors"] };

export function validateProfile(values: ProfileFormValues): ProfileValidation {
  const fieldErrors: ProfileFormState["fieldErrors"] = {};

  if (!values.name) {
    fieldErrors.name = "Name is required.";
  }
  for (const field of ["name", "roll_number", "branch", "avatar_url"] as const) {
    if (values[field].length > PROFILE_MAX_LENGTH[field]) {
      fieldErrors[field] = `Keep this under ${PROFILE_MAX_LENGTH[field]} characters.`;
    }
  }

  let batchYear: number | null = null;
  if (values.batch_year) {
    batchYear = Number(values.batch_year);
    if (
      !Number.isInteger(batchYear) ||
      batchYear < BATCH_YEAR_MIN ||
      batchYear > BATCH_YEAR_MAX
    ) {
      fieldErrors.batch_year = `Enter a year between ${BATCH_YEAR_MIN} and ${BATCH_YEAR_MAX}.`;
    }
  }

  if (values.avatar_url && !fieldErrors.avatar_url && !isWebUrl(values.avatar_url)) {
    fieldErrors.avatar_url = "Enter a web link starting with https://";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    update: {
      name: values.name,
      roll_number: values.roll_number || null,
      branch: values.branch || null,
      batch_year: batchYear,
      avatar_url: values.avatar_url || null,
    },
  };
}
