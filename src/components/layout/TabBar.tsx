import { NavigationTracker, TabBarLinks } from "@/components/layout/NavLinks";
import { createClient } from "@/lib/supabase/server";

/** Phone tab bar. Display only, like the header: pages check access themselves. */
export async function TabBar() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (
    <>
      <NavigationTracker />
      <TabBarLinks signedIn={Boolean(data?.claims?.sub)} />
    </>
  );
}
