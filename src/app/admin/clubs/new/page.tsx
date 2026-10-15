import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { NotSuperAdmin } from "@/components/layout/ManageNotice";
import { NewClubForm } from "@/components/clubs/NewClubForm";
import { PageHeader } from "@/components/ui/PageHeader";

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
    return <NotSuperAdmin />;
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-5 pb-16 md:pt-10">
      <Breadcrumbs
        items={[
          { label: "Manage", href: "/admin/clubs" },
          { label: "New club" },
        ]}
      />
      <PageHeader
        size="md"
        title="New club"
        description="Only real, verified-by-you DTU societies belong here. Students can't create clubs themselves."
      />

      <NewClubForm />
    </main>
  );
}
