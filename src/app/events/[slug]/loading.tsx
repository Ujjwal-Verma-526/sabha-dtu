import { Skeleton } from "@/components/ui/Spinner";

export default function EventLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-[1064px] flex-1 px-4 pt-4 pb-6 md:grid md:grid-cols-[360px_minmax(0,1fr)] md:gap-13 md:px-8 md:pt-12"
    >
      <span className="sr-only" role="status">
        Loading event
      </span>
      <Skeleton className="aspect-[5/4] w-full rounded-[20px] md:aspect-[4/5]" />
      <div>
        <Skeleton className="mt-4 h-5 w-40 md:mt-0" />
        <div className="mt-5 flex items-end gap-3">
          <Skeleton className="h-16 w-20 md:h-28 md:w-36" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="mt-4 h-8 w-11/12 md:h-11" />
        <Skeleton className="mt-2 h-8 w-2/3 md:h-11" />
        <div className="mt-5 grid max-w-[560px] grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[100px] rounded-[14px] md:h-28" />
          ))}
        </div>
        <Skeleton className="mt-5 hidden h-36 max-w-[560px] rounded-2xl md:block" />
      </div>
    </main>
  );
}
