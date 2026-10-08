import type { EventStatus } from "@/lib/supabase/types";

// When an event's end_at isn't after its start_at (the schema only requires
// end_at >= start_at, so an admin can set them equal), treat it as ending
// this long after it starts. Without this, a ticket would stop showing its
// QR the moment doors open.
export const EVENT_END_FALLBACK_HOURS = 4;

export type TicketState = "active" | "on_hold" | "ended" | "cancelled";

export function effectiveEventEnd(startAt: string, endAt: string): Date {
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
