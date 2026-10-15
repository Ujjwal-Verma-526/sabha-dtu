import Link from "next/link";

export type Crumb = { label: string; href?: string };

/** Trail for admin pages. The last crumb is the current page (no link). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 md:mb-4">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-medium text-ink-soft">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-2">
              {item.href && !isLast ? (
                <Link href={item.href} className="rounded hover:text-ink hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={`max-w-[14rem] truncate ${isLast ? "text-ink" : ""}`}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span aria-hidden="true" className="text-control">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
