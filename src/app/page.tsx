import { Landing } from "@/components/landing/Landing";

// Signed-in visitors never get here: src/proxy.ts sends them to /events.
export default function Home() {
  return <Landing signedIn={false} />;
}
