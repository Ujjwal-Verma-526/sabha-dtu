"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type {
  ClubDetailsFieldName,
  ClubDetailsState,
  ClubDetailsValues,
} from "@/lib/club-form";
import { IMAGE_URL_MAX_LENGTH } from "@/lib/storage-url";

function FieldError({ name, message }: { name: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={`${name}-error`} role="alert" className="text-xs text-red-700">
      {message}
    </span>
  );
}

export function ClubDetailsForm({
  action,
  initialValues,
}: {
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

  // Props that tie an input to its error message.
  const invalid = (name: ClubDetailsFieldName) => ({
    "aria-invalid": Boolean(fieldErrors[name]),
    "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
    className: fieldErrors[name] ? "border-red-400" : undefined,
  });

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Category</span>
        <Input name="category" defaultValue={values.category} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Description</span>
        <Textarea
          name="description"
          rows={4}
          defaultValue={values.description}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Logo URL</span>
        <Input
          name="logo_url"
          type="url"
          maxLength={IMAGE_URL_MAX_LENGTH}
          defaultValue={values.logo_url}
          {...invalid("logo_url")}
        />
        <FieldError name="logo_url" message={fieldErrors.logo_url} />
        <span className="text-xs text-ink-soft">
          A link to an image already stored in Sabha&apos;s storage.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Instagram handle</span>
        <Input
          name="instagram_handle"
          maxLength={31}
          placeholder="dtu_robotics"
          defaultValue={values.instagram_handle}
          {...invalid("instagram_handle")}
        />
        <FieldError
          name="instagram_handle"
          message={fieldErrors.instagram_handle}
        />
      </label>

      <SubmitButton variant="primary" className="mt-2" pendingLabel="Saving…">
        Save changes
      </SubmitButton>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className="text-sm text-green-700">
          Changes saved.
        </p>
      )}
    </form>
  );
}
