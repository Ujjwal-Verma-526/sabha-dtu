"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckInActionResult, CheckInCounts } from "@/lib/check-in";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import type { CheckInResult, Database } from "@/lib/supabase/types";

// Door check-in actions. They only pass input through to the check-in RPCs
// (supabase/migrations/20260830000001_door_checkin.sql), which decide who may
// check in whom and when. Nothing here is an authorization check.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A real token is 32 characters; this only stops absurd input early.
const MAX_TOKEN_LENGTH = 200;

const SIGNED_OUT_MESSAGE = "Your session has ended. Sign in again to keep checking people in.";
const BAD_INPUT_MESSAGE = "That request wasn't valid. Reload the page and try again.";

async function getSignedInClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

// Two head-only counts under the existing event_registrations SELECT policy,
// which lets the event's managers (and super_admins) see its registrations.
async function countCheckIns(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<CheckInCounts | null> {
  const [registered, checkedIn] = await Promise.all([
    supabase
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
    supabase
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .not("checked_in_at", "is", null),
  ]);

  if (registered.error || checkedIn.error) {
    console.error(
      "Counting check-ins failed:",
      registered.error?.message,
      checkedIn.error?.message,
    );
    return null;
  }
  return { registered: registered.count ?? 0, checkedIn: checkedIn.count ?? 0 };
}

async function finish(
  supabase: SupabaseClient<Database>,
  eventId: string,
  rpc: { data: CheckInResult[] | null; error: { code?: string; message: string } | null },
  action: string,
): Promise<CheckInActionResult> {
  const counts = await countCheckIns(supabase, eventId);

  if (rpc.error) {
    return { ok: false, error: friendlyDbError(rpc.error, action), counts };
  }
  const result = rpc.data?.[0];
  if (!result) {
    console.error(`Check-in RPC returned no row while ${action}`);
    return { ok: false, error: "Something went wrong. Please try again.", counts };
  }
  return { ok: true, result, counts };
}

export async function checkInByToken(
  eventId: string,
  token: string,
): Promise<CheckInActionResult> {
  if (!UUID_PATTERN.test(eventId) || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, error: BAD_INPUT_MESSAGE, counts: null };
  }
  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT_MESSAGE, counts: null };

  const rpc = await supabase.rpc("check_in_by_token", { p_event_id: eventId, p_token: token });
  return finish(supabase, eventId, rpc, "checking in a ticket");
}

export async function manualCheckIn(
  eventId: string,
  registrationId: string,
): Promise<CheckInActionResult> {
  if (!UUID_PATTERN.test(eventId) || !UUID_PATTERN.test(registrationId)) {
    return { ok: false, error: BAD_INPUT_MESSAGE, counts: null };
  }
  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT_MESSAGE, counts: null };

  const rpc = await supabase.rpc("manual_check_in", { p_registration_id: registrationId });
  return finish(supabase, eventId, rpc, "checking someone in by name");
}

export async function undoCheckIn(
  eventId: string,
  registrationId: string,
): Promise<CheckInActionResult> {
  if (!UUID_PATTERN.test(eventId) || !UUID_PATTERN.test(registrationId)) {
    return { ok: false, error: BAD_INPUT_MESSAGE, counts: null };
  }
  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: SIGNED_OUT_MESSAGE, counts: null };

  const rpc = await supabase.rpc("undo_check_in", { p_registration_id: registrationId });
  return finish(supabase, eventId, rpc, "undoing a check-in");
}

export async function getCheckInCounts(eventId: string): Promise<CheckInCounts | null> {
  if (!UUID_PATTERN.test(eventId)) return null;
  const supabase = await getSignedInClient();
  if (!supabase) return null;
  return countCheckIns(supabase, eventId);
}
