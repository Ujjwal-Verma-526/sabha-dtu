"use client";

import { useActionState } from "react";
import {
  createClub,
  type CreateClubState,
} from "@/app/admin/clubs/actions";
import { Card } from "@/components/ui/Card";
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

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} role="alert" className="text-xs text-red-700">
      {message}
    </span>
  );
}

export function NewClubForm() {
  const [state, formAction] = useActionState(createClub, initialState);
  const { values, fieldErrors } = state;

  return (
    <>
      {state.error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      <Card className="mt-6">
        <form action={formAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Name</span>
            <Input
              name="name"
              required
              placeholder="Robotics Club"
              defaultValue={values.name}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "name-error" : undefined}
              className={fieldErrors.name ? "border-red-400" : undefined}
            />
            <FieldError id="name-error" message={fieldErrors.name} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Category</span>
            <Input
              name="category"
              placeholder="Technical"
              defaultValue={values.category}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Description</span>
            <Textarea
              name="description"
              rows={3}
              defaultValue={values.description}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Instagram handle</span>
            <Input
              name="instagram_handle"
              maxLength={31}
              placeholder="dtu_robotics"
              defaultValue={values.instagram_handle}
              aria-invalid={Boolean(fieldErrors.instagram_handle)}
              aria-describedby={
                fieldErrors.instagram_handle ? "instagram-handle-error" : undefined
              }
              className={
                fieldErrors.instagram_handle ? "border-red-400" : undefined
              }
            />
            <FieldError
              id="instagram-handle-error"
              message={fieldErrors.instagram_handle}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              Admin user ID (optional)
            </span>
            <Input
              name="admin_user_id"
              placeholder="Leave blank to make yourself the admin"
              defaultValue={values.admin_user_id}
              aria-invalid={Boolean(fieldErrors.admin_user_id)}
              aria-describedby={
                fieldErrors.admin_user_id ? "admin-user-id-error" : undefined
              }
              className={fieldErrors.admin_user_id ? "border-red-400" : undefined}
            />
            <FieldError
              id="admin-user-id-error"
              message={fieldErrors.admin_user_id}
            />
            <span className="text-xs text-ink-soft">
              The Supabase user id of the person who should manage this club.
              Leave blank to become its admin yourself and hand it off later.
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="verified"
              className="h-4 w-4"
              defaultChecked={values.verified}
            />
            Verified (visible in the public directory immediately)
          </label>

          <SubmitButton
            variant="primary"
            className="mt-2"
            pendingLabel="Creating…"
          >
            Create club
          </SubmitButton>
        </form>
      </Card>
    </>
  );
}
