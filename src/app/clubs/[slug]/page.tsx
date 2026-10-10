import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClubLogo } from "@/components/clubs/ClubLogo";
import { VerifiedBadge } from "@/components/clubs/VerifiedBadge";
import { ButtonLink } from "@/components/ui/Button";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Card } from "@/components/ui/Card";
import { requestToJoin } from "./actions";

export default async function ClubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select(
      "id, name, slug, description, logo_url, category, instagram_handle, verified",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!club) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: events }, { data: membership }, { data: profile }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, title, venue, start_at")
        .eq("club_id", club.id)
        .eq("status", "published")
        .gte("start_at", new Date().toISOString())
        .order("start_at")
        .limit(10),
      user
        ? supabase
            .from("club_members")
            .select("role, status")
            .eq("club_id", club.id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase.from("users").select("role").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const isManager =
    (membership?.status === "approved" &&
      (membership.role === "admin" || membership.role === "coordinator")) ||
    profile?.role === "super_admin";

  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-start gap-4">
        <ClubLogo
          name={club.name}
          logoUrl={club.logo_url}
          className="h-20 w-20 shrink-0 text-2xl"
        />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-ink">
              {club.name}
            </h1>
            {club.verified && <VerifiedBadge />}
          </div>
          {club.category && (
            <p className="mt-1 font-mono text-xs uppercase tracking-wide text-ink-soft">
              {club.category}
            </p>
          )}
          {club.instagram_handle && (
            <a
              href={`https://instagram.com/${club.instagram_handle.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm text-primary hover:underline"
            >
              @{club.instagram_handle.replace(/^@/, "")}
            </a>
          )}
        </div>
      </div>

      {club.description && (
        <p className="mt-6 text-ink-soft">{club.description}</p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <MembershipAction
          clubId={club.id}
          slug={club.slug}
          isSignedIn={!!user}
          status={membership?.status ?? null}
        />
        {isManager && (
          <>
            <ButtonLink
              href={`/admin/clubs/${club.id}`}
              variant="ghost"
              className="text-sm"
            >
              Manage club
            </ButtonLink>
            <ButtonLink
              href={`/admin/clubs/${club.id}/events/new`}
              variant="ghost"
              className="text-sm"
            >
              Create event
            </ButtonLink>
          </>
        )}
      </div>

      <section className="mt-12">
        <h2 className="font-display text-lg font-semibold text-ink">
          Upcoming events
        </h2>
        {events && events.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {events.map((event) => (
              <Card key={event.id}>
                <p className="font-display font-semibold text-ink">
                  {event.title}
                </p>
                <p className="mt-1 font-mono text-xs text-ink-soft">
                  {new Date(event.start_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {event.venue ? ` · ${event.venue}` : ""}
                </p>
              </Card>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">
            Upcoming events will appear here.
          </p>
        )}
      </section>
    </main>
  );
}

function MembershipAction({
  clubId,
  slug,
  isSignedIn,
  status,
}: {
  clubId: string;
  slug: string;
  isSignedIn: boolean;
  status: "pending" | "approved" | "rejected" | null;
}) {
  if (!isSignedIn) {
    return (
      <ButtonLink href="/login" variant="ghost" className="text-sm">
        Sign in to request to join
      </ButtonLink>
    );
  }

  if (status === "approved") {
    return (
      <span className="rounded-full border border-line px-4 py-2 text-sm text-ink-soft">
        Member
      </span>
    );
  }

  if (status === "pending") {
    return (
      <span className="rounded-full border border-line px-4 py-2 text-sm text-ink-soft">
        Request pending
      </span>
    );
  }

  const joinWithArgs = requestToJoin.bind(null, clubId, slug);

  return (
    <ActionForm action={joinWithArgs}>
      <SubmitButton variant="primary" className="text-sm" pendingLabel="Sending…">
        {status === "rejected" ? "Request again" : "Request to join"}
      </SubmitButton>
    </ActionForm>
  );
}
