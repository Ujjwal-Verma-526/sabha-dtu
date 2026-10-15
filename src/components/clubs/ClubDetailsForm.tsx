"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FieldError, FormNotice, fieldStackClass, labelClass } from "@/components/ui/Field";
import type {
  ClubDetailsFieldName,
  ClubDetailsState,
  ClubDetailsValues,
} from "@/lib/club-form";
import { LogoUpload } from "@/components/clubs/LogoUpload";

export function ClubDetailsForm({
  clubId,
  clubName,
  action,
  initialValues,
}: {
  clubId: string;
  clubName: string;
  /** updateClub with the club id already bound: (previousState, formData). */
  action: (
    previous: ClubDetailsState,
    formData: FormData,
  ) => Promise<ClubDetailsState>;
  initialValues: ClubDetailsValues;
}) {
  const [state, formAction] = useActionState(action, {
    error: null,
    fieldErrors: {},
    values: initialValues,
    saved: false,
  });
  const { values, fieldErrors } = state;

  // Props that tie an input to its error message. Input turns its own
  // border red when aria-invalid is set.
  const invalid = (name: ClubDetailsFieldName) => ({
    "aria-invalid": Boolean(fieldErrors[name]),
    "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
  });

  return (
    <form action={formAction} className="mt-3 flex min-w-0 flex-col gap-5">
      <div className={fieldStackClass}>
        <span className={labelClass}>Logo</span>
        <LogoUpload
          clubId={clubId}
          clubName={clubName}
          defaultValue={values.logo_url}
          invalid={Boolean(fieldErrors.logo_url)}
        />
        <FieldError id="logo_url-error" message={fieldErrors.logo_url} />
      </div>

      <label className={fieldStackClass}>
        <span className={labelClass}>Category</span>
        <Input name="category" defaultValue={values.category} />
      </label>

      <label className={fieldStackClass}>
        <span className={labelClass}>Description</span>
        <Textarea name="description" rows={4} defaultValue={values.description} />
      </label>

      <label className={fieldStackClass}>
        <span className={labelClass}>Instagram handle</span>
        <Input
          name="instagram_handle"
          maxLength={31}
          placeholder="dtu_robotics"
          defaultValue={values.instagram_handle}
          {...invalid("instagram_handle")}
        />
        <FieldError id="instagram_handle-error" message={fieldErrors.instagram_handle} />
      </label>

      {state.error && <FormNotice tone="error">{state.error}</FormNotice>}
      {state.saved && <FormNotice tone="success">Changes saved.</FormNotice>}

      <SubmitButton
        variant="primary"
        className="w-full sm:w-auto sm:self-start"
        pendingLabel="Saving…"
      >
        Save changes
      </SubmitButton>
    </form>
  );
}
