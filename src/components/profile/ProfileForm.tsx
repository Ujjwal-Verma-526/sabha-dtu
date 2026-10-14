"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  BATCH_YEAR_MAX,
  BATCH_YEAR_MIN,
  PROFILE_MAX_LENGTH,
  type ProfileFieldName,
  type ProfileFormState,
  type ProfileFormValues,
} from "@/lib/profile-form";

type ProfileFormProps = {
  action: (
    previous: ProfileFormState,
    formData: FormData,
  ) => Promise<ProfileFormState>;
  initialValues: ProfileFormValues;
};

function FieldError({ name, message }: { name: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={`${name}-error`} role="alert" className="text-xs text-danger">
      {message}
    </span>
  );
}

export function ProfileForm({ action, initialValues }: ProfileFormProps) {
  const [state, formAction] = useActionState<ProfileFormState, FormData>(
    action,
    { error: null, fieldErrors: {}, values: initialValues, saved: false },
  );
  const { values, fieldErrors } = state;

  // Props that tie an input to its error message.
  const invalid = (name: ProfileFieldName) => ({
    "aria-invalid": Boolean(fieldErrors[name]),
    "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
    className: fieldErrors[name] ? "border-danger" : undefined,
  });

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      )}
      {state.saved && (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success"
        >
          Saved
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Name</span>
        <Input
          name="name"
          required
          maxLength={PROFILE_MAX_LENGTH.name}
          defaultValue={values.name}
          {...invalid("name")}
        />
        <FieldError name="name" message={fieldErrors.name} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Roll number</span>
        <Input
          name="roll_number"
          maxLength={PROFILE_MAX_LENGTH.roll_number}
          defaultValue={values.roll_number}
          {...invalid("roll_number")}
        />
        <FieldError name="roll_number" message={fieldErrors.roll_number} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Branch</span>
        <Input
          name="branch"
          maxLength={PROFILE_MAX_LENGTH.branch}
          defaultValue={values.branch}
          {...invalid("branch")}
        />
        <FieldError name="branch" message={fieldErrors.branch} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Batch year</span>
        <Input
          name="batch_year"
          type="number"
          min={BATCH_YEAR_MIN}
          max={BATCH_YEAR_MAX}
          defaultValue={values.batch_year}
          {...invalid("batch_year")}
        />
        <FieldError name="batch_year" message={fieldErrors.batch_year} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Avatar URL</span>
        <Input
          name="avatar_url"
          maxLength={PROFILE_MAX_LENGTH.avatar_url}
          defaultValue={values.avatar_url}
          {...invalid("avatar_url")}
        />
        <FieldError name="avatar_url" message={fieldErrors.avatar_url} />
      </label>

      <SubmitButton variant="primary" className="mt-2" pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
