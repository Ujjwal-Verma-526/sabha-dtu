"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RegisterResult =
  | {
      ok: true;
      ticketCode: string;
      // Used to link to /tickets#ticket-<id>. The QR token itself is never
      // sent to the client from here; /tickets reads it server-side.
      registrationId: string;
      alreadyRegistered: boolean;
    }
  | {
      ok: false;
      reason:
        | "login_required"
        | "not_found"
        | "cancelled"
        | "closed"
        | "deadline_passed"
        | "full"
        | "unknown";
      message: string;
    };

// Every check here is a convenience layer for a friendly, specific CTA
// state — the actual authority is server-side: RLS
// (event_registrations_insert_self, supabase/migrations/20260825000004)
// restricts the insert to the caller's own user_id on a published event,
// the unique(event_id, user_id) constraint stops duplicates, and the
// enforce_registration_rules trigger (20260828000001_event_registration_
// guards.sql) re-checks status/deadline/capacity with a row lock so it
// can't be raced by two concurrent submissions. A client can't get a
// registration created by skipping any of this.
export async function registerForEvent(
  eventId: string,
  slug: string,
): Promise<RegisterResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      reason: "login_required",
      message: "Log in to register for this event.",
    };
  }

  // Check for an existing registration first. The capacity/deadline trigger
  // is BEFORE INSERT, so it fires ahead of the unique(event_id, user_id)
  // check — without this, an already-registered user retrying after the
  // event fills (double click, stale tab) would be told "full" instead of
  // being handed their existing ticket.
  const { data: existingRegistration } = await supabase
    .from("event_registrations")
    .select("id, ticket_code")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingRegistration) {
    return {
      ok: true,
      ticketCode: existingRegistration.ticket_code,
      registrationId: existingRegistration.id,
      alreadyRegistered: true,
    };
  }

  const { data: event } = await supabase
    .from("events")
    .select("status, registration_deadline, capacity")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return {
      ok: false,
      reason: "not_found",
      message: "This event is no longer available.",
    };
  }

  if (event.status === "cancelled") {
    return {
      ok: false,
      reason: "cancelled",
      message: "This event has been cancelled.",
    };
  }

  if (event.status !== "published") {
    return {
      ok: false,
      reason: "closed",
      message: "Registration isn't open for this event.",
    };
  }

  if (
    event.registration_deadline &&
    new Date() > new Date(event.registration_deadline)
  ) {
    return {
      ok: false,
      reason: "deadline_passed",
      message: "The registration deadline has passed.",
    };
  }

  if (event.capacity != null) {
    const { data: count } = await supabase.rpc(
      "get_event_registration_count",
      { target_event: eventId },
    );
    if (count != null && count >= event.capacity) {
      return { ok: false, reason: "full", message: "This event is full." };
    }
  }

  const { data: inserted, error } = await supabase
    .from("event_registrations")
    .insert({ event_id: eventId, user_id: user.id })
    .select("id, ticket_code")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Unique violation on (event_id, user_id) — a duplicate submission
      // (double click, retried request) landed on an existing
      // registration. Treat it as success and hand back that ticket
      // rather than surfacing a confusing "already registered" error.
      const { data: existing } = await supabase
        .from("event_registrations")
        .select("id, ticket_code")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .single();

      if (existing) {
        return {
          ok: true,
          ticketCode: existing.ticket_code,
          registrationId: existing.id,
          alreadyRegistered: true,
        };
      }
    }

    if (error.message.includes("deadline has passed")) {
      return {
        ok: false,
        reason: "deadline_passed",
        message: "The registration deadline has passed.",
      };
    }
    if (error.message.includes("at capacity")) {
      return { ok: false, reason: "full", message: "This event is full." };
    }
    if (error.message.includes("not open for registration")) {
      return {
        ok: false,
        reason: "closed",
        message: "Registration isn't open for this event.",
      };
    }

    return {
      ok: false,
      reason: "unknown",
      message: "Could not complete registration. Please try again.",
    };
  }

  revalidatePath(`/events`);
  revalidatePath(`/events/${slug}`);
  revalidatePath("/tickets");
  return {
    ok: true,
    ticketCode: inserted.ticket_code,
    registrationId: inserted.id,
    alreadyRegistered: false,
  };
}
