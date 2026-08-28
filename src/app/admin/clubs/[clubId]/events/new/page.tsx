import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { BannerUpload } from "@/components/events/BannerUpload";
import { createEvent } from "../actions";

export default async function NewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { clubId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: club }, { data: membership }, { data: profile }] =
    await Promise.all([
      supabase.from("clubs").select("id, name").eq("id", clubId).maybeSingle(),
      supabase
        .from("club_members")
        .select("role, status")
        .eq("club_id", clubId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
    ]);

  if (!club) notFound();

  const isSuperAdmin = profile?.role === "super_admin";
  const isManager =
    membership?.status === "approved" &&
    (membership.role === "admin" || membership.role === "coordinator");

  if (!isSuperAdmin && !isManager) {
    return (
      <main className="mx-auto max-w-lg flex-1 px-6 py-16 text-center">
        <p className="text-ink-soft">You don&apos;t manage this club.</p>
      </main>
    );
  }

  const createWithClub = createEvent.bind(null, clubId);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-wide text-ink-soft">
        {club.name}
      </p>
      <h1 className="font-display text-2xl font-bold text-ink">New event</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Saves as a draft first — nothing is public until you publish it.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Card className="mt-6">
        <form action={createWithClub} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Banner image</span>
            <BannerUpload clubId={clubId} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Title</span>
            <Input name="title" required placeholder="Robowars Finals" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Description</span>
            <Textarea
              name="description"
              required
              rows={4}
              placeholder="What's happening, who it's for, anything students should know before registering."
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Venue</span>
            <Input name="venue" required placeholder="Main Auditorium" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Starts</span>
              <Input name="start_at" type="datetime-local" required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">Ends</span>
              <Input name="end_at" type="datetime-local" required />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              Registration deadline{" "}
              <span className="font-normal text-ink-soft">(optional)</span>
            </span>
            <Input name="registration_deadline" type="datetime-local" />
            <span className="text-xs text-ink-soft">
              Must be at or before the start time.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              Capacity{" "}
              <span className="font-normal text-ink-soft">(optional)</span>
            </span>
            <Input name="capacity" type="number" min={1} placeholder="200" />
          </label>

          <Button type="submit" variant="primary" className="mt-2">
            Save draft
          </Button>
        </form>
      </Card>
    </main>
  );
}
