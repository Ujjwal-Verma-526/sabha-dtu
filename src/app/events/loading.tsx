import { Skeleton } from "@/components/ui/Spinner";

function RowSkeleton() {
  return (
    <div className="flex items-start gap-3.5 border-b border-line py-3.5 last:border-b-0">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <Skeleton className="aspect-square w-[84px] rounded-xl md:w-28" />
    </div>
  );
}

export default function EventsLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 md:px-8 md:pt-11"
    >
      <span className="sr-only" role="status">
        Loading events
      </span>
      <div className="md:max-w-[calc(100%-356px)]">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="mt-3 h-11 w-64 md:h-16 md:w-[26rem]" />
        <Skeleton className="mt-5 h-4 w-72" />
        <div className="mt-5 flex gap-2">
          {[48, 96, 84, 72].map((w) => (
            <Skeleton key={w} className="h-9 rounded-full" style={{ width: w }} />
          ))}
        </div>
        {[0, 1].map((day) => (
          <div key={day} className="mt-8 md:grid md:grid-cols-[132px_minmax(0,1fr)] md:gap-6">
            <div className="flex items-end gap-2.5 border-b border-line pb-2.5 md:block md:border-0">
              <Skeleton className="h-11 w-14 md:h-16 md:w-24" />
              <Skeleton className="h-3 w-16 md:mt-2" />
            </div>
            <div>
              <RowSkeleton />
              {day === 0 && <RowSkeleton />}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
