import { cn } from "@/lib/utils";

// 24px stroke icons, drawn in currentColor. Decorative by default: give the
// surrounding control its own accessible name.
const paths = {
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  seat: (
    <>
      <path d="M4 8.5a2 2 0 0 0 0 4v3.5h16v-3.5a2 2 0 0 0 0-4V5H4z" />
      <path d="M10 5v11" strokeDasharray="2 2" />
    </>
  ),
  clubs: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <circle cx="16.5" cy="10" r="2.6" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 14.3c2.6-.4 5 1 5.8 4.7" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 8.5a2 2 0 0 0 0 4v5h16v-5a2 2 0 0 0 0-4v-2H4z" />
      <path d="M14 7.5v10" strokeDasharray="2 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c1-3.8 4-5.6 7.5-5.6s6.5 1.8 7.5 5.6" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  chevronDown: <path d="m7 10 5 5 5-5" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  manage: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  className,
  strokeWidth = 1.7,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("h-[1em] w-[1em] shrink-0", className)}
    >
      {paths[name]}
    </svg>
  );
}

/** Filled rosette with a tick: the verified-society mark. */
export function VerifiedTick({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <path
        fill="currentColor"
        d="M12 2.5 14.6 5l3.6-.4.4 3.6L21.5 11l-2.4 2.6.4 3.6-3.6.4L12.5 20.5 9.9 18l-3.6.4-.4-3.6L3 12.2l2.4-2.6-.4-3.6 3.6-.4z"
      />
      <path
        d="m8.5 12 2.4 2.4 4.6-4.8"
        fill="none"
        stroke="var(--paper)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
