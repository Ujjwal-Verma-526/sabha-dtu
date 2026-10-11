import type { EventStatus } from "@/lib/supabase/types";

// When an event's end_at isn't after its start_at (the schema only requires
// end_at >= start_at, so an admin can set them equal), treat it as ending
// this long after it starts. Without this, a ticket would stop showing its
// QR the moment doors open.
//
// The database has the same rule in public.event_effective_end
// (supabase/migrations/20260831000001_registration_closes_at_start.sql),
// used by the registration-deadline CHECK and door check-in. Change both
// together. Everything in the app that needs "when does this event end"
// (tickets, check-in display, "Happening now", the event form) calls
// effectiveEventEnd.
export const EVENT_END_FALLBACK_HOURS = 4;

export type TicketState = "active" | "on_hold" | "ended" | "cancelled";

export function effectiveEventEnd(startAt: Date | string, endAt: Date | string): Date {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (end.getTime() > start.getTime()) {
    return end;
  }
  return new Date(start.getTime() + EVENT_END_FALLBACK_HOURS * 60 * 60 * 1000);
}

// Only "active" tickets show a scannable QR. Order matters: a cancelled
// event is "cancelled" even after its date, and a draft event whose date
// has passed is simply "ended".
export function getTicketState(
  eventStatus: EventStatus,
  startAt: string,
  endAt: string,
  now: Date,
): TicketState {
  if (eventStatus === "cancelled") return "cancelled";
  if (eventStatus === "completed") return "ended";
  if (now.getTime() > effectiveEventEnd(startAt, endAt).getTime()) return "ended";
  if (eventStatus === "draft") return "on_hold";
  return "active";
}
