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
