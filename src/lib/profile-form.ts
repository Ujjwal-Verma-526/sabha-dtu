/**
 * Shapes and rules shared by the /profile form and the updateProfile server
 * action, so the inputs' attributes and the server-side checks can't drift
 * apart.
 *
 * The database is the source of truth for every limit here: these mirror its
 * CHECK constraints so the form can explain a problem beside the field
 * instead of failing with a generic error. Change both together.
 */

/** Mirrors users_batch_year_range in supabase/migrations/20260825000001_schema.sql. */
export const BATCH_YEAR_MIN = 2000;
export const BATCH_YEAR_MAX = 2100;

/**
 * Mirrors users_name_length, users_roll_number_length and users_branch_length
 * in supabase/migrations/20260901000001_profile_field_checks.sql. The database
 * counts characters; .length counts UTF-16 units, which is never fewer, so
 * anything that passes here passes there.
 *
 * avatar_url isn't part of this form: the photo has its own uploader and save
 * action (src/lib/avatar.ts), which only ever stores a URL in our own
 * storage, well inside users_avatar_url_length and users_avatar_url_web.
 */
export const PROFILE_MAX_LENGTH = {
  name: 100,
  roll_number: 30,
  branch: 100,
} as const;

export type ProfileFormValues = {
  name: string;
  roll_number: string;
  branch: string;
  batch_year: string;
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
  };
}

export type ProfileValidation =
  | { ok: true; update: ProfileUpdate }
  | { ok: false; fieldErrors: ProfileFormState["fieldErrors"] };

export function validateProfile(values: ProfileFormValues): ProfileValidation {
  const fieldErrors: ProfileFormState["fieldErrors"] = {};

  // Mirrors users_name_not_blank (values are already trimmed).
  if (!values.name) {
    fieldErrors.name = "Name is required.";
  }
  for (const field of ["name", "roll_number", "branch"] as const) {
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
    },
  };
}
