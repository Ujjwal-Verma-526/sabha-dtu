import { effectiveEventEnd } from "@/lib/tickets";

// Registration closes at the event's start_at, unless the organiser set a
// later registration_deadline (which may be as late as end_at). The DATABASE
// decides: enforce_registration_rules in
// supabase/migrations/20260831000001_registration_closes_at_start.sql refuses
// the insert from this instant on. This mirrors it so the UI can show the
// right state up front. Change both together.

type RegistrationTiming = {
  start_at: string;
  registration_deadline: string | null;
};

export function registrationClosesAt(event: RegistrationTiming): Date {
  return new Date(event.registration_deadline ?? event.start_at);
}

/** Closed from the closing instant itself onward, like the trigger (now() >= closes_at). */
export function isRegistrationClosed(event: RegistrationTiming, now: Date): boolean {
  return now.getTime() >= registrationClosesAt(event).getTime();
}

/**
 * Started and not yet over. "Over" uses the same effective end as tickets and
 * door check-in: end_at, or start + 4 h when end_at isn't after start_at.
 */
export function isHappeningNow(
  event: { start_at: string; end_at: string },
  now: Date,
): boolean {
  return (
    new Date(event.start_at).getTime() <= now.getTime() &&
    now.getTime() < effectiveEventEnd(event.start_at, event.end_at).getTime()
  );
}
