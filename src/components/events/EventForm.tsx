"use client";

import { useActionState, useRef, useState } from "react";
import { BannerUpload } from "@/components/events/BannerUpload";
import {
  FieldError,
  FormNotice,
  fieldStackClass,
  helpClass,
  labelClass,
  labelHintClass,
} from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Textarea } from "@/components/ui/Textarea";
import { CATEGORY_KEYS, categoryLabel } from "@/lib/categories";
import type { EventStatus } from "@/lib/supabase/types";
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
  /** The event's current status, or null for a new event. Picks the buttons. */
  status: EventStatus | null;
  /** The club's recent distinct venues, newest first (recentVenues). */
  recentVenues: string[];
};

// Plain chips, not category colours: forms stay plain. Each wraps a real,
// visually hidden radio (peer), so it works without JS.
const chipClass = cn(
  "inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium text-ink transition-colors select-none",
  "hover:border-ink peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper",
  "peer-focus-visible:ring-3 peer-focus-visible:ring-primary/40",
  "[&>svg]:hidden peer-checked:[&>svg]:block",
);

/** "YYYY-MM-DD" plus one calendar day, or "" if the value isn't a date. */
function nextDay(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day.getTime())) return "";
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

export function EventForm({
  clubId,
  action,
  initialValues,
  status,
  recentVenues,
}: EventFormProps) {
  const [state, formAction] = useActionState<EventFormState, FormData>(action, {
    error: null,
    fieldErrors: {},
    values: initialValues,
    savedMessage: null,
  });
  const { values, fieldErrors } = state;
  const [confirmingDraft, setConfirmingDraft] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const venueRef = useRef<HTMLInputElement>(null);

  // Props that tie an input to its error message. Input and Textarea turn
  // their own border red when aria-invalid is set.
  const invalid = (name: EventFieldName) => ({
    "aria-invalid": Boolean(fieldErrors[name]),
    "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
  });

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-6">
      {state.error && <FormNotice tone="error">{state.error}</FormNotice>}
      {state.savedMessage && <FormNotice tone="success">{state.savedMessage}</FormNotice>}

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

      {/* One date and two times. The end date only shows (pure CSS, so it
          works without JS) when "Ends on a different day" is ticked; the
          server ignores it otherwise. */}
      <fieldset className="group/day flex min-w-0 flex-col gap-3">
        <legend className={cn(labelClass, "mb-1.5")}>
          When<span className={labelHintClass}> · IST</span>
        </legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-[1.4fr_1fr_1fr]">
          <label className={cn(fieldStackClass, "col-span-2 sm:col-span-1")}>
            <span className={cn(labelClass, "font-medium")}>Date</span>
            <Input
              ref={dateRef}
              name="date"
              type="date"
              required
              className="w-full min-w-0"
              defaultValue={values.date}
              {...invalid("date")}
            />
            <FieldError id="date-error" message={fieldErrors.date} />
          </label>
          <label className={fieldStackClass}>
            <span className={cn(labelClass, "font-medium")}>Starts</span>
            <Input
              name="start_time"
              type="time"
              required
              className="w-full min-w-0"
              defaultValue={values.start_time}
              {...invalid("start_time")}
            />
            <FieldError id="start_time-error" message={fieldErrors.start_time} />
          </label>
          <label className={fieldStackClass}>
            <span className={cn(labelClass, "font-medium")}>Ends</span>
            <Input
              name="end_time"
              type="time"
              required
              className="w-full min-w-0"
              defaultValue={values.end_time}
              {...invalid("end_time")}
            />
            <FieldError id="end_time-error" message={fieldErrors.end_time} />
          </label>
        </div>

        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start text-sm font-medium text-ink">
          <input
            type="checkbox"
            name="ends_different_day"
            defaultChecked={values.ends_different_day === "on"}
            className="size-5 shrink-0 accent-primary"
            onChange={(event) => {
              // Suggest the next day for an overnight event (hack nights).
              const endDate = endDateRef.current;
              if (event.currentTarget.checked && endDate && !endDate.value) {
                endDate.value = nextDay(dateRef.current?.value ?? "");
              }
            }}
          />
          Ends on a different day
        </label>

        <label
          className={cn(
            fieldStackClass,
            "hidden sm:max-w-[calc((100%-1.5rem)*1.4/3.4)] group-has-checked/day:flex",
          )}
        >
          <span className={cn(labelClass, "font-medium")}>End date</span>
          <Input
            ref={endDateRef}
            name="end_date"
            type="date"
            className="w-full min-w-0"
            defaultValue={values.end_date}
            {...invalid("end_date")}
          />
          <FieldError id="end_date-error" message={fieldErrors.end_date} />
        </label>
      </fieldset>

      <div className={fieldStackClass}>
        <label htmlFor="venue" className={labelClass}>
          Venue
        </label>
        <Input
          ref={venueRef}
          id="venue"
          name="venue"
          required
          placeholder="Main Auditorium"
          defaultValue={values.venue}
          {...invalid("venue")}
        />
        <FieldError id="venue-error" message={fieldErrors.venue} />
        {recentVenues.length > 0 && (
          <div role="group" aria-label="Recent venues" className="mt-1 flex flex-wrap items-center gap-2">
            <span className={helpClass}>Recent:</span>
            {recentVenues.map((venue) => (
              <button
                key={venue}
                type="button"
                onClick={() => {
                  const input = venueRef.current;
                  if (!input) return;
                  input.value = venue;
                  input.focus();
                }}
                className="inline-flex h-9 max-w-full items-center rounded-full border border-control bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="truncate">{venue}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Real radios, so it works without JS and the browser enforces the
          choice. */}
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
                  chipClass,
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

        <div className="mt-5 flex flex-col gap-6">
          <label className={cn(fieldStackClass, "sm:max-w-xs")}>
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

          {/* The custom time shows (pure CSS) only while "At a custom time"
              is picked; the server ignores it otherwise. */}
          <fieldset className="group/deadline flex min-w-0 flex-col gap-1.5">
            <legend className={cn(labelClass, "mb-1.5")}>Registration closes</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["start", "When the event starts"],
                  ["custom", "At a custom time"],
                ] as const
              ).map(([mode, label]) => (
                <label key={mode} className="relative">
                  <input
                    type="radio"
                    id={`deadline-${mode}`}
                    name="deadline_mode"
                    value={mode}
                    defaultChecked={values.deadline_mode === mode}
                    className="peer sr-only"
                  />
                  <span className={cn(chipClass, "border-control")}>
                    <Icon name="check" strokeWidth={2.4} className="text-[15px]" />
                    {label}
                  </span>
                </label>
              ))}
            </div>
            <span className={cn(helpClass, "group-has-[#deadline-custom:checked]/deadline:hidden")}>
              Students can register until the start time.
            </span>
            <label
              className={cn(
                fieldStackClass,
                "mt-3 hidden sm:max-w-xs group-has-[#deadline-custom:checked]/deadline:flex",
              )}
            >
              <span className={cn(labelClass, "font-medium")}>
                Closes at<span className={labelHintClass}> · IST</span>
              </span>
              <Input
                name="registration_deadline"
                type="datetime-local"
                className="w-full min-w-0"
                defaultValue={values.registration_deadline}
                {...invalid("registration_deadline")}
              />
              <FieldError
                id="registration_deadline-error"
                message={fieldErrors.registration_deadline}
              />
              <span className={helpClass}>
                Any time up to the end of the event. A time after the start keeps registration
                open while it runs.
              </span>
            </label>
          </fieldset>
        </div>
      </section>

      {/* Primary button last in the DOM but shown first on phones: the
          browser's Enter-to-submit uses the first submit button, so Enter
          in a field saves a draft rather than publishing. */}
      <div className="flex flex-col gap-3 border-t border-line pt-6">
        {status === null || status === "draft" ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <SubmitButton name="intent" value="draft" variant="ghost" pendingLabel="Saving…">
              Save draft
            </SubmitButton>
            <SubmitButton name="intent" value="publish" variant="primary" pendingLabel="Publishing…">
              Publish
            </SubmitButton>
          </div>
        ) : status === "published" ? (
          <>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                aria-expanded={confirmingDraft}
                onClick={() => setConfirmingDraft(true)}
              >
                Move to draft
              </Button>
              <SubmitButton name="intent" value="save" variant="primary" pendingLabel="Saving…">
                Save changes
              </SubmitButton>
            </div>
            {confirmingDraft && (
              <div className="flex flex-col gap-3 rounded-xl bg-soft px-3.5 py-3 sm:flex-row sm:items-center">
                <p className="mr-auto text-sm text-ink">
                  <span className="font-semibold">Move back to draft?</span> Students won&rsquo;t
                  see it or be able to register, and tickets already issued go on hold until you
                  publish again.
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setConfirmingDraft(false)}>
                    Keep published
                  </Button>
                  <SubmitButton name="intent" value="draft" variant="primary" pendingLabel="Saving…">
                    Save as draft
                  </SubmitButton>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex sm:justify-end">
            <SubmitButton
              name="intent"
              value="save"
              variant="primary"
              className="w-full sm:w-auto"
              pendingLabel="Saving…"
            >
              Save changes
            </SubmitButton>
          </div>
        )}
      </div>
    </form>
  );
}
