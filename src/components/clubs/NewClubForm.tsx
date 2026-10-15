"use client";

import { useActionState } from "react";
import {
  createClub,
  type CreateClubState,
} from "@/app/admin/clubs/actions";
import {
  FieldError,
  FormNotice,
  fieldStackClass,
  helpClass,
  labelClass,
  labelHintClass,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { SubmitButton } from "@/components/ui/SubmitButton";

const initialState: CreateClubState = {
  error: null,
  fieldErrors: {},
  values: {
    name: "",
    category: "",
    description: "",
    instagram_handle: "",
    admin_user_id: "",
    verified: false,
  },
};

export function NewClubForm() {
  const [state, formAction] = useActionState(createClub, initialState);
  const { values, fieldErrors } = state;

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-5">
      {state.error && <FormNotice tone="error">{state.error}</FormNotice>}

      <label className={fieldStackClass}>
        <span className={labelClass}>Name</span>
        <Input
          name="name"
          required
          placeholder="Robotics Club"
          defaultValue={values.name}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" message={fieldErrors.name} />
      </label>

      <label className={fieldStackClass}>
        <span className={labelClass}>
          Category<span className={labelHintClass}> · optional</span>
        </span>
        <Input name="category" placeholder="Technical" defaultValue={values.category} />
      </label>

      <label className={fieldStackClass}>
        <span className={labelClass}>
          Description<span className={labelHintClass}> · optional</span>
        </span>
        <Textarea name="description" rows={3} defaultValue={values.description} />
      </label>

      <label className={fieldStackClass}>
        <span className={labelClass}>
          Instagram handle<span className={labelHintClass}> · optional</span>
        </span>
        <Input
          name="instagram_handle"
          maxLength={31}
          placeholder="dtu_robotics"
          defaultValue={values.instagram_handle}
          aria-invalid={Boolean(fieldErrors.instagram_handle)}
          aria-describedby={fieldErrors.instagram_handle ? "instagram-handle-error" : undefined}
        />
        <FieldError id="instagram-handle-error" message={fieldErrors.instagram_handle} />
      </label>

      <label className={fieldStackClass}>
        <span className={labelClass}>
          Admin user ID<span className={labelHintClass}> · optional</span>
        </span>
        <Input
          name="admin_user_id"
          placeholder="Leave blank to make yourself the admin"
          defaultValue={values.admin_user_id}
          aria-invalid={Boolean(fieldErrors.admin_user_id)}
          aria-describedby={fieldErrors.admin_user_id ? "admin-user-id-error" : undefined}
        />
        <FieldError id="admin-user-id-error" message={fieldErrors.admin_user_id} />
        <span className={helpClass}>
          The Supabase user id of the person who should manage this club. Leave blank to become
          its admin yourself and hand it off later.
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink">
        <input
          type="checkbox"
          name="verified"
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
          defaultChecked={values.verified}
        />
        <span>
          <span className="block font-semibold">Verified</span>
          <span className="block text-ink-soft">Visible in the public directory immediately.</span>
        </span>
      </label>

      <SubmitButton
        variant="primary"
        className="w-full sm:w-auto sm:self-start"
        pendingLabel="Creating…"
      >
        Create club
      </SubmitButton>
    </form>
  );
}
