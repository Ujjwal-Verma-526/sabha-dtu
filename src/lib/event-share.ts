import {
  IST_TIME_ZONE,
  formatIstShortDate,
  formatIstTime,
  isSameIstDay,
  toIstDateTimeLocal,
} from "@/lib/ist";
import { effectiveEventEnd } from "@/lib/tickets";

// Everything an event page hands to the outside world: the share text, the
// WhatsApp and Google Calendar links, and the .ics file. All times are IST
// (src/lib/ist.ts), whatever zone the server runs in. A calendar entry spans
// start_at to the effective end (src/lib/tickets.ts), so an event with
// end_at = start_at is still a 4-hour block rather than an instant.

export type ShareableEvent = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  venue: string | null;
  start_at: string;
  end_at: string;
  clubName: string | null;
};

/** The event page's path, e.g. "/events/robowars-finals". */
export function eventPath(slug: string): string {
  return `/events/${encodeURIComponent(slug)}`;
}

/**
 * "Fri, 16 Oct · 6:00 pm – 8:00 pm". No end time when end_at isn't after
 * start_at; the end's date too when it falls on another IST day.
 */
export function eventWhen(startAt: string, endAt: string): string {
  const start = `${formatIstShortDate(startAt)} · ${formatIstTime(startAt)}`;
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) return start;
  if (isSameIstDay(startAt, endAt)) return `${start} – ${formatIstTime(endAt)}`;
  return `${start} – ${formatIstShortDate(endAt)} · ${formatIstTime(endAt)}`;
}

/** "Fri, 16 Oct · 6:00 pm – 8:00 pm · Lab 2, EE Department" */
export function eventWhenWhere(event: Pick<ShareableEvent, "start_at" | "end_at" | "venue">): string {
  const when = eventWhen(event.start_at, event.end_at);
  return event.venue ? `${when} · ${event.venue}` : when;
}

/** The message "Send to WhatsApp" pre-fills: title, date and time, venue, link. */
export function whatsappMessage(event: ShareableEvent, eventUrl: string): string {
  return [
    event.title,
    eventWhen(event.start_at, event.end_at),
    ...(event.venue ? [event.venue] : []),
    eventUrl,
  ].join("\n");
}

export function whatsappUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

const CALENDAR_DETAILS_MAX = 800;

/** Cuts at a word boundary and adds an ellipsis; text that fits comes back unchanged. */
export function truncateText(text: string, max: number): string {
  const flat = text.trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** What a calendar entry's notes say: the description, the society, the link. */
function calendarDetails(event: ShareableEvent, eventUrl: string): string {
  return [
    ...(event.description ? [truncateText(event.description, CALENDAR_DETAILS_MAX), ""] : []),
    ...(event.clubName ? [`Hosted by ${event.clubName} on Sabha.`] : []),
    eventUrl,
  ].join("\n");
}

/** 20261020T123000Z */
function utcStamp(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(event: ShareableEvent, eventUrl: string): string {
  const start = new Date(event.start_at);
  const end = effectiveEventEnd(event.start_at, event.end_at);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    details: calendarDetails(event, eventUrl),
    ctz: IST_TIME_ZONE,
  });
  if (event.venue) params.set("location", event.venue);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// --- .ics (RFC 5545) ---

const CRLF = "\r\n";

function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Lines are at most 75 octets; the rest continues on lines that start with a space. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (currentBytes + bytes > limit) {
      pieces.push(current);
      current = "";
      currentBytes = 0;
      limit = 74; // the leading space of a continuation line counts too
    }
    current += char;
    currentBytes += bytes;
  }
  pieces.push(current);
  return pieces.join(`${CRLF} `);
}

/** 20261020T180000, the IST wall-clock time for a TZID=Asia/Kolkata property. */
function istStamp(instant: Date): string {
  return `${toIstDateTimeLocal(instant).replace(/[-:]/g, "")}00`;
}

/**
 * A one-event calendar file. DTSTART/DTEND carry the IST wall-clock time with
 * TZID=Asia/Kolkata (and the zone defined below, UTC+05:30 all year since
 * India has no daylight saving), so any calendar app converts to the
 * viewer's own zone.
 */
export function buildIcs(event: ShareableEvent, eventUrl: string, now: Date = new Date()): string {
  const start = new Date(event.start_at);
  const end = effectiveEventEnd(event.start_at, event.end_at);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sabha//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${IST_TIME_ZONE}`,
    "BEGIN:STANDARD",
    "DTSTART:19450101T000000",
    "TZOFFSETFROM:+0530",
    "TZOFFSETTO:+0530",
    "TZNAME:IST",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${event.id}@sabha`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=${IST_TIME_ZONE}:${istStamp(start)}`,
    `DTEND;TZID=${IST_TIME_ZONE}:${istStamp(end)}`,
    `SUMMARY:${icsText(event.title)}`,
    `DESCRIPTION:${icsText(calendarDetails(event, eventUrl))}`,
    ...(event.venue ? [`LOCATION:${icsText(event.venue)}`] : []),
    `URL:${eventUrl}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}
