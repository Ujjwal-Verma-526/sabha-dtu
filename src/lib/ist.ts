// Every event time Sabha reads from a form or shows on a page is Indian
// Standard Time, whatever timezone the server runs in. Vercel runs in UTC,
// so `new Date("2026-10-20T18:00")` there means 18:00 UTC, which is
// 11:30 pm IST. Parse and format through this file instead of relying on
// the server's zone. India has had no daylight saving since 1945, so IST
// is a fixed UTC+05:30.

export const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// hourCycle h23 gives midnight as "00", never "24".
const datetimeLocalParts = new Intl.DateTimeFormat("en-US", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * The value an `<input type="datetime-local">` needs ("YYYY-MM-DDTHH:mm")
 * for this instant, in IST.
 */
export function toIstDateTimeLocal(instant: Date | string): string {
  const parts: Record<string, string> = {};
  for (const part of datetimeLocalParts.formatToParts(new Date(instant))) {
    parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Reads a datetime-local value ("YYYY-MM-DDTHH:mm") as an IST wall-clock
 * time. Returns null for any other format and for dates that don't exist
 * (`new Date` would quietly roll 2026-02-30 over to 2 March).
 */
export function parseIstDateTimeLocal(value: string): Date | null {
  if (!DATETIME_LOCAL_PATTERN.test(value)) return null;

  const instant = new Date(`${value}:00${IST_OFFSET}`);
  if (Number.isNaN(instant.getTime())) return null;
  if (toIstDateTimeLocal(instant) !== value) return null;
  return instant;
}

/**
 * The IST calendar day named by a date input value ("YYYY-MM-DD"), as
 * [start, nextDayStart). Returns null if the value isn't a real date.
 */
export function istDayRange(
  value: string,
): { start: Date; nextDayStart: Date } | null {
  if (!DATE_PATTERN.test(value)) return null;

  const start = parseIstDateTimeLocal(`${value}T00:00`);
  if (!start) return null;
  const nextDayStart = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, nextDayStart };
}

const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: IST_TIME_ZONE,
});
const timeFormat = new Intl.DateTimeFormat("en-IN", {
  timeStyle: "short",
  timeZone: IST_TIME_ZONE,
});
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
});

/** "20 Oct 2026, 6:00 pm" */
export function formatIstDateTime(instant: Date | string): string {
  return dateTimeFormat.format(new Date(instant));
}

/** "6:00 pm" */
export function formatIstTime(instant: Date | string): string {
  return timeFormat.format(new Date(instant));
}

/** "20/10/2026" */
export function formatIstDate(instant: Date | string): string {
  return dateFormat.format(new Date(instant));
}

/** Whether two instants fall on the same IST calendar day. */
export function isSameIstDay(a: Date | string, b: Date | string): boolean {
  return formatIstDate(a) === formatIstDate(b);
}

const dayPartsFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: IST_TIME_ZONE,
});
const longDateFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: IST_TIME_ZONE,
});
const shortDateFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: IST_TIME_ZONE,
});

/** The IST calendar day as "YYYY-MM-DD", for grouping by day. */
export function istDayKey(instant: Date | string): string {
  return toIstDateTimeLocal(instant).slice(0, 10);
}

/** { weekday: "Fri", day: "16", month: "Oct" } in IST, for date numerals. */
export function istDayParts(instant: Date | string): {
  weekday: string;
  day: string;
  month: string;
} {
  const parts: Record<string, string> = {};
  for (const part of dayPartsFormat.formatToParts(new Date(instant))) {
    parts[part.type] = part.value;
  }
  return { weekday: parts.weekday, day: parts.day, month: parts.month };
}

/** "Friday, 16 October" */
export function formatIstLongDate(instant: Date | string): string {
  return longDateFormat.format(new Date(instant));
}

/** "Fri, 16 Oct" */
export function formatIstShortDate(instant: Date | string): string {
  return shortDateFormat.format(new Date(instant));
}

/** Whole IST calendar days from `from` to `to` (negative if `to` is earlier). */
export function istDaysBetween(from: Date | string, to: Date | string): number {
  const day = (instant: Date | string) => Date.parse(`${istDayKey(instant)}T00:00:00Z`);
  return Math.round((day(to) - day(from)) / (24 * 60 * 60 * 1000));
}

/** Days since this IST week's Monday (0 = Monday). */
export function istWeekday(instant: Date | string): number {
  return (new Date(`${istDayKey(instant)}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Midnight IST at the start of next Monday: the end of `now`'s IST
 * calendar week, the same Monday-to-Sunday week /events calls "This week".
 */
export function istWeekEnd(now: Date): Date {
  const today = parseIstDateTimeLocal(`${istDayKey(now)}T00:00`)!;
  return new Date(today.getTime() + (7 - istWeekday(now)) * 24 * 60 * 60 * 1000);
}

/** "Today", "Tomorrow", "In 3 days" (up to two weeks out), else null. */
export function istRelativeDay(instant: Date | string, now: Date): string | null {
  const days = istDaysBetween(now, instant);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 14) return `In ${days} days`;
  return null;
}
