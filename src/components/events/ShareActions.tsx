import { ShareButton } from "@/components/events/ShareButton";
import { buttonClass } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

const linkClass = buttonClass("ghost", "min-h-11 text-sm");

/**
 * The event page's share and calendar links. "Share" is the one client piece
 * (share sheet or copy); the rest are plain links, so they work before the
 * page hydrates. Nothing here loads a script from anywhere.
 */
export function ShareActions({
  title,
  summary,
  eventUrl,
  whatsappHref,
  googleCalendarHref,
  icsHref,
}: {
  title: string;
  /** "Fri, 16 Oct · 6:00 pm · Lab 2" for the share sheet; the link goes with it. */
  summary: string;
  eventUrl: string;
  whatsappHref: string;
  /** Null once the event is over: nothing left to put in a calendar. */
  googleCalendarHref: string | null;
  icsHref: string | null;
}) {
  return (
    <section aria-label="Share and add to calendar" className="mt-5 md:max-w-[560px]">
      <div role="group" aria-label="Share" className="flex flex-wrap gap-2">
        <ShareButton title={title} text={summary} url={eventUrl} />
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
          <Icon name="message" className="text-lg" />
          Send to WhatsApp
        </a>
      </div>
      {googleCalendarHref && icsHref && (
        <div role="group" aria-label="Add to calendar" className="mt-2 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] font-semibold text-ink-soft">Add to calendar</span>
          <a href={googleCalendarHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <Icon name="calendar" className="text-lg" />
            Google Calendar
          </a>
          <a href={icsHref} download className={linkClass}>
            <Icon name="download" className="text-lg" />
            Download .ics
          </a>
        </div>
      )}
    </section>
  );
}
