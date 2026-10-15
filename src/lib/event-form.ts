/** Shapes shared by the event form component and the event server actions. */

import { toIstDateTimeLocal } from "@/lib/ist";

export type EventFormValues = {
  title: string;
  /** One of CATEGORY_KEYS (src/lib/categories.ts), or "" before a pick. */
  category: string;
  description: string;
  venue: string;
  /** date input value, "YYYY-MM-DD" (IST). The day the event starts. */
  date: string;
  /** time input values, "HH:mm" (IST) */
  start_time: string;
  end_time: string;
  /** "on" when the event ends on a later day than it starts (end_date). */
  ends_different_day: string;
  /** date input value, read only when ends_different_day is "on". */
  end_date: string;
  /** "start" (closes when the event starts) or "custom". */
  deadline_mode: string;
  /** datetime-local value, "YYYY-MM-DDTHH:mm"; read only when deadline_mode is "custom". */
  registration_deadline: string;
  capacity: string;
  banner_url: string;
};

export type EventFieldName = keyof EventFormValues;

/**
 * Which submit button was pressed. "publish" and "draft" set the status as
 * well as saving; "save" (editing a published, cancelled or completed
 * event) leaves the status alone.
 */
export type EventFormIntent = "publish" | "draft" | "save";

export type EventFormState = {
  /** Form-level error not tied to one field. */
  error: string | null;
  fieldErrors: Partial<Record<EventFieldName, string>>;
  /** What the user submitted, so the form can keep it after an error. */
  values: EventFormValues;
  /** Confirmation after a successful save that stays on the page (editing). */
  savedMessage: string | null;
};

export const emptyEventValues: EventFormValues = {
  title: "",
  category: "",
  description: "",
  venue: "",
  date: "",
  start_time: "",
  end_time: "",
  ends_different_day: "",
  end_date: "",
  deadline_mode: "start",
  registration_deadline: "",
  capacity: "",
  banner_url: "",
};

/** Splits a stored start/end pair into the form's date and time fields, in IST. */
export function eventTimingValues(
  startAt: string,
  endAt: string,
): Pick<EventFormValues, "date" | "start_time" | "end_time" | "ends_different_day" | "end_date"> {
  const [date, startTime] = toIstDateTimeLocal(startAt).split("T");
  const [endDate, endTime] = toIstDateTimeLocal(endAt).split("T");
  const differentDay = endDate !== date;
  return {
    date,
    start_time: startTime,
    end_time: endTime,
    ends_different_day: differentDay ? "on" : "",
    end_date: differentDay ? endDate : "",
  };
}

const RECENT_VENUE_LIMIT = 5;

/**
 * The first few distinct venues (ignoring case and spacing) from a club's
 * events, newest first, for the venue shortcuts in the form.
 */
export function recentVenues(
  rows: Array<{ venue: string | null }>,
  limit = RECENT_VENUE_LIMIT,
): string[] {
  const seen = new Set<string>();
  const venues: string[] = [];
  for (const { venue } of rows) {
    const trimmed = venue?.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    venues.push(trimmed);
    if (venues.length === limit) break;
  }
  return venues;
}
