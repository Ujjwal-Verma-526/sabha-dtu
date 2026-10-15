import Link from "next/link";
import { CategoryDot, EventPoster } from "@/components/events/EventPoster";
import { Icon } from "@/components/ui/Icon";
import { categoryKey, categoryLabel } from "@/lib/categories";
import { formatIstDateTime, formatIstTime, isSameIstDay } from "@/lib/ist";

export type EventListData = {
  slug: string;
  title: string;
  banner_url: string | null;
  venue: string | null;
  start_at: string;
  end_at: string;
  capacity: number | null;
  category: string;
  club: { name: string; slug: string; verified: boolean };
};

/** The signed-in viewer is registered for this event. Text plus a tick, never colour alone. */
function GoingMark({ className }: { className: string }) {
  return (
    <p className={`flex items-center gap-1 text-[13px] font-semibold ${className}`}>
      <Icon name="check" strokeWidth={2.4} />
      You&apos;re going
    </p>
  );
}

/** One event in the day-grouped /events list: text on the left, poster on the right. */
export function EventRow({ event, going = false }: { event: EventListData; going?: boolean }) {
  const category = categoryKey(event.category);
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group flex items-start gap-3.5 border-b border-line py-3.5 last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-soft">
          {formatIstTime(event.start_at)}
          <CategoryDot category={category} className="ml-1" />
          <span className="truncate">{categoryLabel(category)}</span>
        </p>
        <h3 className="mt-0.5 text-[16.5px] leading-snug font-semibold tracking-[-0.015em] text-ink group-hover:text-primary md:text-lg">
          {event.title}
        </h3>
        <p className="mt-0.5 text-[13.5px] text-ink-soft">
          {event.club.name}
          {event.venue && ` · ${event.venue}`}
        </p>
        {going && <GoingMark className="mt-1.5 text-success" />}
      </div>
      <EventPoster
        title={event.title}
        clubName={event.club.name}
        bannerUrl={event.banner_url}
        category={category}
        size="thumb"
        className="aspect-square w-[84px] shrink-0 rounded-xl md:w-28"
      />
    </Link>
  );
}

/** Rani-pink band for an event that's running right now. */
export function LiveBanner({ event, going = false }: { event: EventListData; going?: boolean }) {
  const category = categoryKey(event.category);
  const showsEnd = event.end_at !== event.start_at;
  return (
    <Link
      href={`/events/${event.slug}`}
      className="flex items-center gap-3.5 rounded-2xl bg-live p-3 text-on-live shadow-card md:gap-5 md:p-4"
    >
      <EventPoster
        title={event.title}
        clubName={event.club.name}
        bannerUrl={event.banner_url}
        category={category}
        size="thumb"
        className="aspect-[4/5] w-[84px] shrink-0 rounded-xl md:w-28"
      />
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-bold tracking-[0.1em] whitespace-nowrap uppercase">
          <span aria-hidden="true" className="live-dot h-2 w-2 shrink-0 rounded-full bg-current" />
          <span className="shrink-0">Live now</span>
          {event.venue && <span className="min-w-0 truncate">· {event.venue}</span>}
        </p>
        <h3 className="font-display-tight mt-1 text-[23px] leading-[1.02] md:text-[32px]">
          {event.title}
        </h3>
        <p className="mt-1 text-[13.5px] font-medium">
          {event.club.name}
          {showsEnd &&
            ` · till ${
              isSameIstDay(event.start_at, event.end_at)
                ? formatIstTime(event.end_at)
                : formatIstDateTime(event.end_at)
            }`}
        </p>
        {going && <GoingMark className="mt-1.5" />}
      </div>
    </Link>
  );
}
