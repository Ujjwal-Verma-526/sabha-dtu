"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import {
  FieldError,
  FormNotice,
  fieldStackClass,
  helpClass,
  labelClass,
  labelHintClass,
} from "@/components/ui/Field";
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

export function ProfileForm({ action, initialValues }: ProfileFormProps) {
  const [state, formAction] = useActionState<ProfileFormState, FormData>(
    action,
    { error: null, fieldErrors: {}, values: initialValues, saved: false },
  );
  const { values, fieldErrors } = state;

  // Props that tie an input to its error message. Input turns its own
  // border red when aria-invalid is set.
  const invalid = (name: ProfileFieldName) => ({
    "aria-invalid": Boolean(fieldErrors[name]),
    "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
  });
  const optional = <span className={labelHintClass}> · optional</span>;

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-5">
      {state.error && <FormNotice tone="error">{state.error}</FormNotice>}
      {state.saved && <FormNotice tone="success">Saved</FormNotice>}

      <label className={fieldStackClass}>
        <span className={labelClass}>Name</span>
        <Input
          name="name"
          required
          maxLength={PROFILE_MAX_LENGTH.name}
          defaultValue={values.name}
          {...invalid("name")}
        />
        <FieldError id="name-error" message={fieldErrors.name} />
      </label>

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
        <label className={fieldStackClass}>
          <span className={labelClass}>Roll number{optional}</span>
          <Input
            name="roll_number"
            maxLength={PROFILE_MAX_LENGTH.roll_number}
            defaultValue={values.roll_number}
            {...invalid("roll_number")}
          />
          <FieldError id="roll_number-error" message={fieldErrors.roll_number} />
        </label>

        <label className={fieldStackClass}>
          <span className={labelClass}>Batch year{optional}</span>
          <Input
            name="batch_year"
            type="number"
            min={BATCH_YEAR_MIN}
            max={BATCH_YEAR_MAX}
            defaultValue={values.batch_year}
            {...invalid("batch_year")}
          />
          <FieldError id="batch_year-error" message={fieldErrors.batch_year} />
        </label>
      </div>

      <label className={fieldStackClass}>
        <span className={labelClass}>Branch{optional}</span>
        <Input
          name="branch"
          maxLength={PROFILE_MAX_LENGTH.branch}
          defaultValue={values.branch}
          {...invalid("branch")}
        />
        <FieldError id="branch-error" message={fieldErrors.branch} />
      </label>

      <label className={fieldStackClass}>
        <span className={labelClass}>Avatar URL{optional}</span>
        <Input
          name="avatar_url"
          maxLength={PROFILE_MAX_LENGTH.avatar_url}
          defaultValue={values.avatar_url}
          {...invalid("avatar_url")}
        />
        <span className={helpClass}>A link to a picture of you, starting with https://.</span>
        <FieldError id="avatar_url-error" message={fieldErrors.avatar_url} />
      </label>

      <SubmitButton variant="primary" className="w-full sm:w-auto sm:self-start" pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
