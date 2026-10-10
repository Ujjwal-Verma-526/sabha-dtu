"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError, isUniqueViolation } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// Page-level guards already keep non-managers away from these forms — this
// check just avoids a confusing silent no-op for a direct POST. The real
// enforcement is events_insert_club_manager / events_update_club_manager
// RLS (supabase/migrations/20260825000004_rls_policies.sql).
async function requireClubManager(clubId: string) {
  const { supabase, user } = await requireUser();

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("club_members")
      .select("role, status")
      .eq("club_id", clubId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const isManager =
    membership?.status === "approved" &&
    (membership.role === "admin" || membership.role === "coordinator");
  const isSuperAdmin = profile?.role === "super_admin";

  if (!isManager && !isSuperAdmin) {
    redirect(`/clubs`);
  }

  return { supabase, user };
}

type EventInput = {
  title: string;
  description: string;
  bannerUrl: string | null;
  venue: string;
  startAt: string;
  endAt: string;
  registrationDeadline: string | null;
  capacity: number | null;
};

// Shared shape/business-rule validation for create and update. The same
// invariants are also enforced as CHECK constraints on public.events
// (events_end_after_start, events_deadline_before_start,
// events_capacity_positive) — this just gives a friendly form error
// instead of a raw Postgres constraint-violation message.
function parseEventForm(formData: FormData): EventInput | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const venue = String(formData.get("venue") ?? "").trim();
  const startAt = String(formData.get("start_at") ?? "").trim();
  const endAt = String(formData.get("end_at") ?? "").trim();
  const registrationDeadlineRaw = String(
    formData.get("registration_deadline") ?? "",
  ).trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const bannerUrl = (formData.get("banner_url") as string)?.trim() || null;

  if (!title) return { error: "Title is required." };
  if (!description) return { error: "Description is required." };
  if (!venue) return { error: "Venue is required." };
  if (!startAt) return { error: "Start date/time is required." };
  if (!endAt) return { error: "End date/time is required." };

  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime())) return { error: "Start date/time is invalid." };
  if (Number.isNaN(end.getTime())) return { error: "End date/time is invalid." };
  if (end < start) return { error: "End must be after start." };

  let registrationDeadline: string | null = null;
  if (registrationDeadlineRaw) {
    const deadline = new Date(registrationDeadlineRaw);
    if (Number.isNaN(deadline.getTime())) {
      return { error: "Registration deadline is invalid." };
    }
    if (deadline > start) {
      return { error: "Registration deadline must be before or at the start time." };
    }
    registrationDeadline = deadline.toISOString();
  }

  let capacity: number | null = null;
  if (capacityRaw) {
    capacity = Number(capacityRaw);
    if (!Number.isInteger(capacity) || capacity <= 0) {
      return { error: "Capacity must be a positive whole number." };
    }
  }

  return {
    title,
    description,
    bannerUrl,
    venue,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    registrationDeadline,
    capacity,
  };
}

export async function createEvent(clubId: string, formData: FormData) {
  const { supabase, user } = await requireClubManager(clubId);

  const parsed = parseEventForm(formData);
  if ("error" in parsed) {
    redirect(
      `/admin/clubs/${clubId}/events/new?error=${encodeURIComponent(parsed.error)}`,
    );
  }

  const baseSlug = slugify(parsed.title);
  let event: { id: string } | null = null;

  // events.slug is globally unique (not scoped to a club), so a collision
  // with another club's event is possible. Retry a few times with a short
  // random suffix rather than pre-checking existence — RLS means an
  // authenticated manager can't even see every other club's draft slugs
  // to check against, so "insert and retry on conflict" is the only
  // approach that's actually correct here.
  for (let attempt = 0; attempt < 5 && !event; attempt++) {
    const slug =
      attempt === 0
        ? baseSlug
        : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

    const { data, error } = await supabase
      .from("events")
      .insert({
        club_id: clubId,
        title: parsed.title,
        slug,
        description: parsed.description,
        banner_url: parsed.bannerUrl,
        venue: parsed.venue,
        start_at: parsed.startAt,
        end_at: parsed.endAt,
        registration_deadline: parsed.registrationDeadline,
        capacity: parsed.capacity,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (!error) {
      event = data;
    } else if (isUniqueViolation(error)) {
      continue;
    } else {
      redirect(
        `/admin/clubs/${clubId}/events/new?error=${encodeURIComponent(friendlyDbError(error, "creating an event"))}`,
      );
    }
  }

  if (!event) {
    redirect(
      `/admin/clubs/${clubId}/events/new?error=${encodeURIComponent("An event with a very similar title already exists. Try a different title.")}`,
    );
  }

  revalidatePath(`/admin/clubs/${clubId}/events`);
  redirect(`/admin/clubs/${clubId}/events/${event.id}`);
}

// Whitelisted fields only — never club_id, status, slug, or created_by.
// RLS (events_update_club_manager) is the real backstop; this whitelist
// just keeps the form honest, same pattern as admin/clubs/actions.ts.
export async function updateEvent(
  clubId: string,
  eventId: string,
  formData: FormData,
) {
  const { supabase } = await requireClubManager(clubId);

  const parsed = parseEventForm(formData);
  if ("error" in parsed) {
    redirect(
      `/admin/clubs/${clubId}/events/${eventId}?error=${encodeURIComponent(parsed.error)}`,
    );
  }

  const { error } = await supabase
    .from("events")
    .update({
      title: parsed.title,
      description: parsed.description,
      banner_url: parsed.bannerUrl,
      venue: parsed.venue,
      start_at: parsed.startAt,
      end_at: parsed.endAt,
      registration_deadline: parsed.registrationDeadline,
      capacity: parsed.capacity,
    })
    .eq("id", eventId);

  if (error) {
    redirect(
      `/admin/clubs/${clubId}/events/${eventId}?error=${encodeURIComponent(friendlyDbError(error, "updating an event"))}`,
    );
  }

  revalidatePath(`/admin/clubs/${clubId}/events`);
  revalidatePath(`/admin/clubs/${clubId}/events/${eventId}`);
  revalidatePath("/events");
}

export async function publishEvent(clubId: string, eventId: string) {
  const { supabase } = await requireClubManager(clubId);
  await supabase
    .from("events")
    .update({ status: "published" })
    .eq("id", eventId);

  revalidatePath(`/admin/clubs/${clubId}/events`);
  revalidatePath(`/admin/clubs/${clubId}/events/${eventId}`);
  revalidatePath("/events");
}

export async function cancelEvent(clubId: string, eventId: string) {
  const { supabase } = await requireClubManager(clubId);
  await supabase
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", eventId);

  revalidatePath(`/admin/clubs/${clubId}/events`);
  revalidatePath(`/admin/clubs/${clubId}/events/${eventId}`);
  revalidatePath("/events");
}
