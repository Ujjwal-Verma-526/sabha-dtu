"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  actionError,
  idleState,
  type ActionState,
} from "@/lib/action-state";
import {
  NOT_ALLOWED_MESSAGE,
  friendlyDbError,
  isUniqueViolation,
} from "@/lib/db-errors";
import type { EventFormState, EventFormValues } from "@/lib/event-form";
import { parseIstDateTimeLocal } from "@/lib/ist";
import { createClient } from "@/lib/supabase/server";
import { EVENT_END_FALLBACK_HOURS, effectiveEventEnd } from "@/lib/tickets";
import { slugify } from "@/lib/utils";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// Page-level guards already keep non-managers away from these forms — this
// check just avoids a confusing silent no-op for a direct POST. The real
// enforcement is events_insert_club_manager / events_update_club_manager
// RLS (supabase/migrations/20260825000004_rls_policies.sql).
async function requireClubManager(clubId: string) {
  const { supabase, user } = await requireUser();

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("club_members")
      .select("role, status")
      .eq("club_id", clubId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const isManager =
    membership?.status === "approved" &&
    (membership.role === "admin" || membership.role === "coordinator");
  const isSuperAdmin = profile?.role === "super_admin";

  if (!isManager && !isSuperAdmin) {
    redirect(`/clubs`);
  }

  return { supabase, user };
}

// The deadline may be as late as the event's effective end: end_at, or
// start + EVENT_END_FALLBACK_HOURS when end_at isn't after start_at. Same
// rule as the events_deadline_before_end CHECK (via event_effective_end).
function deadlineAfterEndMessage(start: Date | null, end: Date | null): string {
  if (start && end && end.getTime() <= start.getTime()) {
    return `This event has no separate end time, so the registration deadline must be within ${EVENT_END_FALLBACK_HOURS} hours of the start.`;
  }
  return "Registration deadline must be on or before the end time.";
}

type EventInput = {
  title: string;
  description: string;
  bannerUrl: string | null;
  venue: string;
  startAt: string;
  endAt: string;
  registrationDeadline: string | null;
  capacity: number | null;
};

function readEventValues(formData: FormData): EventFormValues {
  const read = (key: keyof EventFormValues) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  return {
    title: read("title"),
    description: read("description"),
    venue: read("venue"),
    start_at: read("start_at"),
    end_at: read("end_at"),
    registration_deadline: read("registration_deadline"),
    capacity: read("capacity"),
    banner_url: read("banner_url"),
  };
}

// Shared shape/business-rule validation for create and update. The same
// invariants are also enforced as CHECK constraints on public.events
// (events_end_after_start, events_deadline_before_end,
// events_capacity_positive) — this gives a friendly field error before
// the database is involved, and mapEventDbError covers the rest.
function parseEventForm(
  values: EventFormValues,
): { input: EventInput } | { fieldErrors: EventFormState["fieldErrors"] } {
  const fieldErrors: EventFormState["fieldErrors"] = {};

  if (!values.title) fieldErrors.title = "Title is required.";
  if (!values.description) fieldErrors.description = "Description is required.";
  if (!values.venue) fieldErrors.venue = "Venue is required.";
  if (!values.start_at) fieldErrors.start_at = "Start date/time is required.";
  if (!values.end_at) fieldErrors.end_at = "End date/time is required.";

  // The form's datetime-local values are IST wall-clock times; parsing them
  // with new Date() would use the server's timezone (UTC on Vercel).
  const start = parseIstDateTimeLocal(values.start_at);
  const end = parseIstDateTimeLocal(values.end_at);
  if (values.start_at && !start) {
    fieldErrors.start_at = "Start date/time is invalid.";
  }
  if (values.end_at && !end) {
    fieldErrors.end_at = "End date/time is invalid.";
  }
  if (start && end && end < start) {
    fieldErrors.end_at = "End must be after start.";
  }

  let registrationDeadline: string | null = null;
  if (values.registration_deadline) {
    const deadline = parseIstDateTimeLocal(values.registration_deadline);
    if (!deadline) {
      fieldErrors.registration_deadline = "Registration deadline is invalid.";
    } else if (start && end && deadline > effectiveEventEnd(start, end)) {
      fieldErrors.registration_deadline = deadlineAfterEndMessage(start, end);
    } else {
      registrationDeadline = deadline.toISOString();
    }
  }

  let capacity: number | null = null;
  if (values.capacity) {
    capacity = Number(values.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) {
      fieldErrors.capacity = "Capacity must be a positive whole number.";
    }
  }

  // start/end are only null when a field error has already been set.
  if (Object.keys(fieldErrors).length > 0 || !start || !end) {
    return { fieldErrors };
  }

  return {
    input: {
      title: values.title,
      description: values.description,
      bannerUrl: values.banner_url || null,
      venue: values.venue,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      registrationDeadline,
      capacity,
    },
  };
}

function eventFormError(
  values: EventFormValues,
  fieldErrors: EventFormState["fieldErrors"],
  error: string | null = null,
): EventFormState {
  return { error, fieldErrors, values, saved: false };
}

// The CHECK constraints are the backstop for the checks in parseEventForm;
// if one fires anyway, point at the right field.
function mapEventDbError(
  error: { code?: string; message: string },
  values: EventFormValues,
  action: string,
): EventFormState {
  if (error.code === "23514") {
    if (error.message.includes("events_end_after_start")) {
      return eventFormError(values, { end_at: "End must be after start." });
    }
    if (error.message.includes("events_deadline_before_end")) {
      return eventFormError(values, {
        registration_deadline: deadlineAfterEndMessage(
          parseIstDateTimeLocal(values.start_at),
          parseIstDateTimeLocal(values.end_at),
        ),
      });
    }
    if (error.message.includes("events_capacity_positive")) {
      return eventFormError(values, {
        capacity: "Capacity must be a positive whole number.",
      });
    }
  }
  return eventFormError(values, {}, friendlyDbError(error, action));
}

export async function createEvent(
  clubId: string,
  _previousState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase, user } = await requireClubManager(clubId);

  const values = readEventValues(formData);
  const parsed = parseEventForm(values);
  if ("fieldErrors" in parsed) {
    return eventFormError(values, parsed.fieldErrors);
  }
  const input = parsed.input;

  const baseSlug = slugify(input.title);
  if (!baseSlug) {
    return eventFormError(values, {
      title: "Title needs at least one letter or number.",
    });
  }

  let event: { id: string } | null = null;

  // events.slug is globally unique (not scoped to a club), so a collision
  // with another club's event is possible. Retry a few times with a short
  // random suffix rather than pre-checking existence — RLS means an
  // authenticated manager can't even see every other club's draft slugs
  // to check against, so "insert and retry on conflict" is the only
  // approach that's actually correct here.
  for (let attempt = 0; attempt < 5 && !event; attempt++) {
    const slug =
      attempt === 0
        ? baseSlug
        : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

    const { data, error } = await supabase
      .from("events")
      .insert({
        club_id: clubId,
        title: input.title,
        slug,
        description: input.description,
        banner_url: input.bannerUrl,
        venue: input.venue,
        start_at: input.startAt,
        end_at: input.endAt,
        registration_deadline: input.registrationDeadline,
        capacity: input.capacity,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (!error) {
      event = data;
    } else if (!isUniqueViolation(error)) {
      return mapEventDbError(error, values, "creating an event");
    }
  }

  if (!event) {
    return eventFormError(values, {
      title:
        "An event with a very similar title already exists. Try a different title.",
    });
  }

  revalidatePath(`/admin/clubs/${clubId}/events`);
  redirect(`/admin/clubs/${clubId}/events/${event.id}`);
}

// Whitelisted fields only — never club_id, status, slug, or created_by.
// RLS (events_update_club_manager) is the real backstop; this whitelist
// just keeps the form honest, same pattern as admin/clubs/actions.ts.
export async function updateEvent(
  clubId: string,
  eventId: string,
  _previousState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase } = await requireClubManager(clubId);

  const values = readEventValues(formData);
  const parsed = parseEventForm(values);
  if ("fieldErrors" in parsed) {
    return eventFormError(values, parsed.fieldErrors);
  }
  const input = parsed.input;

  const { data, error } = await supabase
    .from("events")
    .update({
      title: input.title,
      description: input.description,
      banner_url: input.bannerUrl,
      venue: input.venue,
      start_at: input.startAt,
      end_at: input.endAt,
      registration_deadline: input.registrationDeadline,
      capacity: input.capacity,
    })
    .eq("id", eventId)
    .eq("club_id", clubId)
    .select("id");

  if (error) {
    return mapEventDbError(error, values, "updating an event");
  }
  if (data.length === 0) {
    return eventFormError(values, {}, NOT_ALLOWED_MESSAGE);
  }

  revalidatePath(`/admin/clubs/${clubId}/events`);
  revalidatePath(`/admin/clubs/${clubId}/events/${eventId}`);
  revalidatePath("/events");
  return { error: null, fieldErrors: {}, values, saved: true };
}

async function setEventStatus(
  clubId: string,
  eventId: string,
  from: Array<"draft" | "published">,
  to: "published" | "cancelled",
  action: string,
): Promise<ActionState> {
  const { supabase } = await requireClubManager(clubId);

  // The status precondition stops, for example, a stale tab from
  // "publishing" an event that has since been cancelled.
  const { data, error } = await supabase
    .from("events")
    .update({ status: to })
    .eq("id", eventId)
    .eq("club_id", clubId)
    .in("status", from)
    .select("id");

  if (error) {
    return actionError(friendlyDbError(error, action));
  }
  if (data.length === 0) {
    return actionError(
      "This event can't be changed in its current state. Refresh the page and try again.",
    );
  }

  revalidatePath(`/admin/clubs/${clubId}/events`);
  revalidatePath(`/admin/clubs/${clubId}/events/${eventId}`);
  revalidatePath("/events");
  // The page re-renders with the new status badge, which is the confirmation.
  return idleState;
}

export async function publishEvent(
  clubId: string,
  eventId: string,
  _previousState: ActionState,
): Promise<ActionState> {
  return setEventStatus(
    clubId,
    eventId,
    ["draft"],
    "published",
    "publishing an event",
  );
}

export async function cancelEvent(
  clubId: string,
  eventId: string,
  _previousState: ActionState,
): Promise<ActionState> {
  return setEventStatus(
    clubId,
    eventId,
    ["draft", "published"],
    "cancelled",
    "cancelling an event",
  );
}
