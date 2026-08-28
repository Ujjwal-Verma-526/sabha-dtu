import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { createClub } from "../actions";

export default async function NewClubPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "super_admin") {
    return (
      <main className="mx-auto max-w-lg flex-1 px-6 py-16 text-center">
        <p className="text-ink-soft">
          This area is for Sabha super admins only.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-ink">New club</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Only real, verified-by-you DTU societies belong here — students
        can&apos;t create clubs themselves.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Card className="mt-6">
        <form action={createClub} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Name</span>
            <Input name="name" required placeholder="Robotics Club" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Category</span>
            <Input name="category" placeholder="Technical" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Description</span>
            <Textarea name="description" rows={3} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Instagram handle</span>
            <Input name="instagram_handle" placeholder="dtu_robotics" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">
              Admin user ID (optional)
            </span>
            <Input
              name="admin_user_id"
              placeholder="Leave blank to make yourself the admin"
            />
            <span className="text-xs text-ink-soft">
              The Supabase user id of the person who should manage this club.
              Leave blank to become its admin yourself and hand it off later.
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="verified" className="h-4 w-4" />
            Verified (visible in the public directory immediately)
          </label>

          <Button type="submit" variant="primary" className="mt-2">
            Create club
          </Button>
        </form>
      </Card>
    </main>
  );
}
