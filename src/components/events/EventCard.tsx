import Link from "next/link";
import { VerifiedBadge } from "@/components/clubs/VerifiedBadge";
import { formatIstDateTime, formatIstTime, isSameIstDay } from "@/lib/ist";

export type EventCardData = {
  slug: string;
  title: string;
  banner_url: string | null;
  venue: string | null;
  start_at: string;
  end_at?: string;
  capacity: number | null;
  club: { name: string; slug: string; verified: boolean };
};

export function EventCard({
  event,
  live = false,
}: {
  event: EventCardData;
  /** In the "Happening now" section: also show when it ends. */
  live?: boolean;
}) {
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-primary"
    >
      <div className="aspect-[16/9] w-full overflow-hidden bg-ink/5">
        {event.banner_url ? (
          // Club-supplied banner URLs — no remote pattern to configure yet,
          // same reasoning as ClubLogo.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.banner_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-sm text-ink-soft">
            Sabha
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-ink-soft">
          <span className="truncate">{event.club.name}</span>
          {event.club.verified && <VerifiedBadge className="px-1.5 py-0.5" />}
        </div>

        <h3 className="font-display text-base font-semibold text-ink group-hover:text-primary">
          {event.title}
        </h3>

        <p className="font-mono text-xs text-ink-soft">
          {live ? "Started " : ""}
          {formatIstDateTime(event.start_at)}
        </p>
        {live && event.end_at && event.end_at !== event.start_at && (
          <p className="font-mono text-xs text-ink-soft">
            Ends{" "}
            {isSameIstDay(event.start_at, event.end_at)
              ? formatIstTime(event.end_at)
              : formatIstDateTime(event.end_at)}
          </p>
        )}

        {event.venue && <p className="text-sm text-ink-soft">{event.venue}</p>}

        {event.capacity != null && (
          <p className="mt-auto text-xs text-ink-soft">
            Capacity: {event.capacity}
          </p>
        )}
      </div>
    </Link>
  );
}
