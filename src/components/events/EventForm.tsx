"use client";

import { useActionState } from "react";
import { BannerUpload } from "@/components/events/BannerUpload";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Textarea } from "@/components/ui/Textarea";
import { CATEGORY_KEYS, categoryLabel } from "@/lib/categories";
import { EVENT_END_FALLBACK_HOURS } from "@/lib/tickets";
import { cn } from "@/lib/utils";
import type {
  EventFieldName,
  EventFormState,
  EventFormValues,
} from "@/lib/event-form";

type EventFormProps = {
  clubId: string;
  /** Server action with its ids already bound: (previousState, formData). */
  action: (
    previous: EventFormState,
    formData: FormData,
  ) => Promise<EventFormState>;
  initialValues: EventFormValues;
  submitLabel: string;
  pendingLabel: string;
};

function FieldError({ name, message }: { name: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={`${name}-error`} role="alert" className="text-xs text-danger">
      {message}
    </span>
  );
}

export function EventForm({
  clubId,
  action,
  initialValues,
  submitLabel,
  pendingLabel,
}: EventFormProps) {
  const [state, formAction] = useActionState<EventFormState, FormData>(action, {
    error: null,
    fieldErrors: {},
    values: initialValues,
    saved: false,
  });
  const { values, fieldErrors } = state;

  // Props that tie an input to its error message.
  const invalid = (name: EventFieldName) => ({
    "aria-invalid": Boolean(fieldErrors[name]),
    "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
    className: fieldErrors[name] ? "border-danger" : undefined,
  });

  return (
    <>
      {state.error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      )}
      {state.saved && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success"
        >
          Changes saved.
        </p>
      )}

      <Card className="mt-6">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Banner image</span>
            <BannerUpload
              clubId={clubId}
              defaultValue={values.banner_url || null}
            />
            <FieldError name="banner_url" message={fieldErrors.banner_url} />
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Title</span>
            <Input
              name="title"
              required
              placeholder="Robowars Finals"
              defaultValue={values.title}
              {...invalid("title")}
            />
            <FieldError name="title" message={fieldErrors.title} />
          </label>

          {/* Plain chips, not category colours: forms stay plain. Real radios,
              so it works without JS and the browser enforces the choice. */}
          <fieldset
            role="radiogroup"
            aria-labelledby="category-label"
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.category)}
            aria-describedby={fieldErrors.category ? "category-error" : undefined}
            className="flex flex-col gap-1.5 text-sm"
          >
            <legend id="category-label" className="mb-1.5 font-medium text-ink">
              Category
            </legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_KEYS.map((key) => (
                <label key={key} className="relative">
                  <input
                    type="radio"
                    name="category"
                    value={key}
                    required
                    defaultChecked={values.category === key}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium text-ink transition-colors select-none",
                      "hover:border-ink peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper",
                      "peer-focus-visible:ring-3 peer-focus-visible:ring-primary/40",
                      "[&>svg]:hidden peer-checked:[&>svg]:block",
                      fieldErrors.category ? "border-danger" : "border-control",
                    )}
                  >
                    <Icon name="check" strokeWidth={2.4} className="text-[15px]" />
                    {categoryLabel(key)}
                  </span>
                </label>
              ))}
            </div>
            <FieldError name="category" message={fieldErrors.category} />
          </fieldset>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Description</span>
            <Textarea
              name="description"
              required
              rows={4}
              placeholder="What's happening, who it's for, anything students should know before registering."
              defaultValue={values.description}
              {...invalid("description")}
            />
            <FieldError name="description" message={fieldErrors.description} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Venue</span>
            <Input
              name="venue"
              required
              placeholder="Main Auditorium"
              defaultValue={values.venue}
              {...invalid("venue")}
            />
            <FieldError name="venue" message={fieldErrors.venue} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">
                Starts <span className="font-normal text-ink-soft">(IST)</span>
              </span>
              <Input
                name="start_at"
                type="datetime-local"
                required
                defaultValue={values.start_at}
                {...invalid("start_at")}
              />
              <FieldError name="start_at" message={fieldErrors.start_at} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">
                Ends <span className="font-normal text-ink-soft">(IST)</span>
              </span>
              <Input
                name="end_at"
                type="datetime-local"
                required
                defaultValue={values.end_at}
                {...invalid("end_at")}
              />
              <FieldError name="end_at" message={fieldErrors.end_at} />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              Registration deadline{" "}
              <span className="font-normal text-ink-soft">(IST, optional)</span>
            </span>
            <Input
              name="registration_deadline"
              type="datetime-local"
              defaultValue={values.registration_deadline}
              {...invalid("registration_deadline")}
            />
            <FieldError
              name="registration_deadline"
              message={fieldErrors.registration_deadline}
            />
            <span className="text-xs text-ink-soft">
              Leave blank to close registration when the event starts. A later
              deadline keeps it open while the event runs, up to the end time
              (or {EVENT_END_FALLBACK_HOURS} hours after the start if the end
              time is the same as the start).
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              Capacity{" "}
              <span className="font-normal text-ink-soft">(optional)</span>
            </span>
            <Input
              name="capacity"
              type="number"
              min={1}
              placeholder="200"
              defaultValue={values.capacity}
              {...invalid("capacity")}
            />
            <FieldError name="capacity" message={fieldErrors.capacity} />
          </label>

          <SubmitButton
            variant="primary"
            className="mt-2"
            pendingLabel={pendingLabel}
          >
            {submitLabel}
          </SubmitButton>
        </form>
      </Card>
    </>
  );
}
