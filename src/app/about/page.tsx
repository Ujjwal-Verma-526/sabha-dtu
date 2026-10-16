import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { SITE_DESCRIPTION } from "@/lib/site-meta";
import { createClient } from "@/lib/supabase/server";

// Same description as the home page (and the same link-preview image, which
// comes from the root layout); only the title differs.
export const metadata: Metadata = {
  title: "About — Sabha",
  description: SITE_DESCRIPTION,
};

// Public to everyone: src/proxy.ts only redirects "/", never "/about".
export default async function About() {
  const supabase = await createClient();
  // Display only (picks the hero buttons); verifies the JWT locally.
  const { data } = await supabase.auth.getClaims();
  return <Landing signedIn={Boolean(data?.claims?.sub)} />;
}
