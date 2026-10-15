import { headers } from "next/headers";
import { buildIcs, eventPath } from "@/lib/event-share";
import { getPublicEventForShare } from "@/lib/public-event";
import { siteOrigin } from "@/lib/site-url";

// "Download .ics" on the event page. Published events only: a draft, a
// cancelled event or an unknown slug all get the same 404.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const event = await getPublicEventForShare(slug);
  if (!event) {
    return new Response("Event not found", { status: 404 });
  }

  const eventUrl = `${siteOrigin(await headers())}${eventPath(event.slug)}`;
  return new Response(buildIcs(event, eventUrl), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug.replace(/[^a-z0-9-]/gi, "-")}.ics"`,
      // The event can be edited or cancelled; always ask again.
      "Cache-Control": "no-cache",
    },
  });
}
