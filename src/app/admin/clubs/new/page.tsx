import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { NewClubForm } from "@/components/clubs/NewClubForm";

export default async function NewClubPage() {
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
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin/clubs" },
          { label: "New club" },
        ]}
      />
      <h1 className="font-display text-2xl font-bold text-ink">New club</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Only real, verified-by-you DTU societies belong here — students
        can&apos;t create clubs themselves.
      </p>

      <NewClubForm />
    </main>
  );
}
