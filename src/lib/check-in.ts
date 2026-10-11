import type { CheckInOutcome, CheckInResult, Database } from "@/lib/supabase/types";
import { effectiveEventEnd } from "@/lib/tickets";
import { formatIstDateTime, formatIstTime, isSameIstDay } from "@/lib/ist";

// Door check-in window, for DISPLAY only. The database decides: these
// offsets mirror check_in_gate (supabase/migrations/20260830000001_door_
// checkin.sql, rewritten in 20260831000001 to take the effective end from
// event_effective_end, the SQL twin of effectiveEventEnd). Change them
// together.
export const CHECK_IN_OPENS_BEFORE_START_HOURS = 2;
export const CHECK_IN_CLOSES_AFTER_END_HOURS = 1;

const HOUR_MS = 60 * 60 * 1000;

export function checkInWindow(startAt: string, endAt: string): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: new Date(new Date(startAt).getTime() - CHECK_IN_OPENS_BEFORE_START_HOURS * HOUR_MS),
    closesAt: new Date(
      effectiveEventEnd(startAt, endAt).getTime() + CHECK_IN_CLOSES_AFTER_END_HOURS * HOUR_MS,
    ),
  };
}

export type WindowStatus =
  | { kind: "not_published" }
  | { kind: "cancelled" }
  | { kind: "ended" }
  | { kind: "too_early"; opensAt: Date }
  | { kind: "open"; closesAt: Date };

export function getWindowStatus(
  event: { status: string; start_at: string; end_at: string },
  now: Date,
): WindowStatus {
  if (event.status === "cancelled") return { kind: "cancelled" };
  if (event.status === "draft") return { kind: "not_published" };
  const { opensAt, closesAt } = checkInWindow(event.start_at, event.end_at);
  if (event.status === "completed" || now > closesAt) return { kind: "ended" };
  if (now < opensAt) return { kind: "too_early", opensAt };
  return { kind: "open", closesAt };
}

/** "6:00 pm" today, or "20 Oct 2026, 6:00 pm" on another IST day. */
export function formatCheckInTime(instant: Date | string, now: Date): string {
  return isSameIstDay(instant, now) ? formatIstTime(instant) : formatIstDateTime(instant);
}

export function describeWindow(status: WindowStatus, now: Date): string {
  switch (status.kind) {
    case "not_published":
      return "This event is a draft. Publish it to check people in.";
    case "cancelled":
      return "This event is cancelled. Nobody can be checked in.";
    case "ended":
      return "Check-in has closed for this event.";
    case "too_early":
      return `Check-in opens at ${formatCheckInTime(status.opensAt, now)}.`;
    case "open":
      return `Check-in is open until ${formatCheckInTime(status.closesAt, now)}.`;
  }
}

export type CheckInCounts = { checkedIn: number; registered: number };

/** What the scan page's server actions return. */
export type CheckInActionResult =
  | { ok: true; result: CheckInResult; counts: CheckInCounts | null }
  | { ok: false; error: string; counts: CheckInCounts | null };

export type CheckInListRow =
  Database["public"]["Functions"]["get_event_check_in_list"]["Returns"][number];

export type ResultTone = "success" | "warning" | "error";

export type ResultView = {
  tone: ResultTone;
  title: string;
  message: string;
};

const GATE_MESSAGES: Partial<Record<CheckInOutcome, ResultView>> = {
  invalid_token: {
    tone: "error",
    title: "Not a valid ticket",
    message: "This ticket doesn't exist or its registration was cancelled.",
  },
  wrong_event: {
    tone: "error",
    title: "Wrong event",
    message: "This is a valid Sabha ticket, but for a different event.",
  },
  not_authorized: {
    tone: "error",
    title: "Not allowed",
    message: "You can only check people in to events your club runs.",
  },
  event_cancelled: {
    tone: "error",
    title: "Event cancelled",
    message: "This event is cancelled, so nobody can be checked in.",
  },
  event_not_published: {
    tone: "error",
    title: "Event not published",
    message: "Publish the event before checking people in.",
  },
  event_ended: {
    tone: "error",
    title: "Check-in has closed",
    message: `Check-in closes ${CHECK_IN_CLOSES_AFTER_END_HOURS} hour after the event ends.`,
  },
  too_early: {
    tone: "error",
    title: "Too early",
    message: `Check-in opens ${CHECK_IN_OPENS_BEFORE_START_HOURS} hours before the event starts.`,
  },
  not_checked_in: {
    tone: "warning",
    title: "Not checked in",
    message: "There was no check-in to undo.",
  },
};

/** Big-panel wording for an RPC result. */
export function describeResult(result: CheckInResult, now: Date): ResultView {
  const name = result.attendee_name ?? "This person";
  switch (result.outcome) {
    case "checked_in":
      return { tone: "success", title: "Checked in", message: name };
    case "already_checked_in":
      return {
        tone: "warning",
        title: "Already checked in",
        message: result.checked_in_at
          ? `${name}, at ${formatCheckInTime(result.checked_in_at, now)}`
          : name,
      };
    case "undone":
      return { tone: "warning", title: "Check-in undone", message: name };
    default:
      return (
        GATE_MESSAGES[result.outcome] ?? {
          tone: "error",
          title: "Something went wrong",
          message: "Please try again.",
        }
      );
  }
}

/** Shown for a QR that isn't a Sabha ticket, without asking the server. */
export const NOT_A_TICKET: ResultView = {
  tone: "error",
  title: "Not a Sabha ticket",
  message: "That QR code isn't a Sabha entry ticket.",
};
