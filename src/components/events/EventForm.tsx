"use client";

import { useActionState } from "react";
import { BannerUpload } from "@/components/events/BannerUpload";
import {
  FieldError,
  FormNotice,
  fieldStackClass,
  helpClass,
  labelClass,
  labelHintClass,
} from "@/components/ui/Field";
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

  // Props that tie an input to its error message. Input and Textarea turn
  // their own border red when aria-invalid is set.
  const invalid = (name: EventFieldName) => ({
    "aria-invalid": Boolean(fieldErrors[name]),
    "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
  });

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-6">
      {state.error && <FormNotice tone="error">{state.error}</FormNotice>}
      {state.saved && <FormNotice tone="success">Changes saved.</FormNotice>}

      <label className={fieldStackClass}>
        <span className={labelClass}>Title</span>
        <Input
          name="title"
          required
          placeholder="Robowars Finals"
          defaultValue={values.title}
          {...invalid("title")}
        />
        <FieldError id="title-error" message={fieldErrors.title} />
      </label>

      <div className="grid gap-6 sm:grid-cols-2 sm:gap-4">
        <label className={fieldStackClass}>
          <span className={labelClass}>
            Starts<span className={labelHintClass}> · IST</span>
          </span>
          <Input
            name="start_at"
            type="datetime-local"
            required
            defaultValue={values.start_at}
            {...invalid("start_at")}
          />
          <FieldError id="start_at-error" message={fieldErrors.start_at} />
        </label>
        <label className={fieldStackClass}>
          <span className={labelClass}>
            Ends<span className={labelHintClass}> · IST</span>
          </span>
          <Input
            name="end_at"
            type="datetime-local"
            required
            defaultValue={values.end_at}
            {...invalid("end_at")}
          />
          <FieldError id="end_at-error" message={fieldErrors.end_at} />
        </label>
      </div>

      <label className={fieldStackClass}>
        <span className={labelClass}>Venue</span>
        <Input
          name="venue"
          required
          placeholder="Main Auditorium"
          defaultValue={values.venue}
          {...invalid("venue")}
        />
        <FieldError id="venue-error" message={fieldErrors.venue} />
      </label>

      {/* Plain chips, not category colours: forms stay plain. Real radios,
          so it works without JS and the browser enforces the choice. */}
      <fieldset
        role="radiogroup"
        aria-labelledby="category-label"
        aria-required="true"
        aria-invalid={Boolean(fieldErrors.category)}
        aria-describedby={fieldErrors.category ? "category-error" : undefined}
        className={fieldStackClass}
      >
        <legend id="category-label" className={cn(labelClass, "mb-1.5")}>
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
        <FieldError id="category-error" message={fieldErrors.category} />
      </fieldset>

      <label className={fieldStackClass}>
        <span className={labelClass}>Description</span>
        <Textarea
          name="description"
          required
          rows={5}
          placeholder="What's happening, who it's for, anything students should know before registering."
          defaultValue={values.description}
          {...invalid("description")}
        />
        <FieldError id="description-error" message={fieldErrors.description} />
      </label>

      <div className={fieldStackClass}>
        <span className={labelClass}>
          Poster<span className={labelHintClass}> · optional</span>
        </span>
        <BannerUpload clubId={clubId} defaultValue={values.banner_url || null} />
        <FieldError id="banner_url-error" message={fieldErrors.banner_url} />
      </div>

      <section aria-labelledby="registration-heading" className="border-t border-line pt-6">
        <h2 id="registration-heading" className="text-[15px] font-semibold text-ink">
          Registration
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          Free, one tap for students. Change these only if you need to.
        </p>

        <div className="mt-5 grid gap-6 sm:grid-cols-2 sm:gap-4">
          <label className={fieldStackClass}>
            <span className={labelClass}>
              Capacity<span className={labelHintClass}> · optional</span>
            </span>
            <Input
              name="capacity"
              type="number"
              min={1}
              placeholder="200"
              defaultValue={values.capacity}
              {...invalid("capacity")}
            />
            <FieldError id="capacity-error" message={fieldErrors.capacity} />
            <span className={helpClass}>Leave blank for no limit.</span>
          </label>

          <label className={fieldStackClass}>
            <span className={labelClass}>
              Registration deadline<span className={labelHintClass}> · IST, optional</span>
            </span>
            <Input
              name="registration_deadline"
              type="datetime-local"
              defaultValue={values.registration_deadline}
              {...invalid("registration_deadline")}
            />
            <FieldError
              id="registration_deadline-error"
              message={fieldErrors.registration_deadline}
            />
          </label>
        </div>
        <p className={cn(helpClass, "mt-2")}>
          Leave the deadline blank to close registration when the event starts. A later deadline
          keeps it open while the event runs, up to the end time (or {EVENT_END_FALLBACK_HOURS}{" "}
          hours after the start if the end time is the same as the start).
        </p>
      </section>

      <SubmitButton
        variant="primary"
        className="w-full sm:w-auto sm:self-start"
        pendingLabel={pendingLabel}
      >
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
