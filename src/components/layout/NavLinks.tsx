"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: IconName };

const MAIN_ITEMS: NavItem[] = [
  { href: "/events", label: "Events", icon: "calendar" },
  { href: "/clubs", label: "Clubs", icon: "clubs" },
  { href: "/tickets", label: "Tickets", icon: "ticket" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Centre links in the desktop header. */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {MAIN_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-soft text-ink" : "text-ink-soft hover:text-ink",
            )}
          >
            {item.label === "Tickets" ? "My tickets" : item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Round profile button at the right of the desktop header. */
export function ProfileLink() {
  const pathname = usePathname();
  const active = isActive(pathname, "/profile");
  return (
    <Link
      href="/profile"
      aria-label="Profile"
      aria-current={active ? "page" : undefined}
      className={cn(
        "hidden h-9 w-9 items-center justify-center rounded-full border text-lg transition-colors md:flex",
        active ? "border-ink bg-soft text-ink" : "border-line text-ink-soft hover:text-ink",
      )}
    >
      <Icon name="user" />
    </Link>
  );
}

// Pages without the phone tab bar, each with where BackLink goes when there
// is no in-app history. The event page has its own sticky Register bar in
// the same spot; the door scanner needs the whole screen. Every page listed
// here gets BackLink in the header instead, so a phone always has a way back.
const HIDDEN_ON: { pattern: RegExp; fallback: (pathname: string) => string }[] = [
  { pattern: /^\/events\/[^/]+$/, fallback: () => "/events" },
  {
    pattern: /^\/admin\/clubs\/[^/]+\/events\/[^/]+\/scan$/,
    fallback: (pathname) => pathname.replace(/\/scan$/, ""),
  },
];

function hidesTabBar(pathname: string) {
  return HIDDEN_ON.some(({ pattern }) => pattern.test(pathname));
}

function backFallback(pathname: string) {
  return HIDDEN_ON.find(({ pattern }) => pattern.test(pathname))?.fallback(pathname) ?? "/events";
}

// Whether this tab has moved between Sabha pages since the app loaded.
// Module memory, so a fresh load (a shared link, a reload) starts at false.
let lastPathname: string | null = null;
let navigatedInApp = false;

/** Records in-app navigations for BackLink. Rendered once, in the layout. */
export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (lastPathname !== null && lastPathname !== pathname) navigatedInApp = true;
    lastPathname = pathname;
  }, [pathname]);
  return null;
}

/**
 * Back arrow at the left of the phone header, on pages without the tab bar.
 * Goes back if the visitor came from another Sabha page; otherwise (a
 * shared link, a reload) it's a plain link to the page's fallback (/events
 * for an event, the event's manage page for the scanner).
 */
export function BackLink() {
  const pathname = usePathname();
  const router = useRouter();
  if (!hidesTabBar(pathname)) return null;
  return (
    <Link
      href={backFallback(pathname)}
      aria-label="Back"
      title="Back"
      onClick={(event) => {
        if (navigatedInApp) {
          event.preventDefault();
          router.back();
        }
      }}
      className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-[22px] text-ink hover:bg-soft md:hidden"
    >
      <Icon name="arrowLeft" strokeWidth={2} />
    </Link>
  );
}

/**
 * Bottom tab bar on phones (hidden from md up). Renders a spacer too, so
 * the footer isn't hidden behind the bar.
 */
export function TabBarLinks({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  if (hidesTabBar(pathname)) return null;

  const items: NavItem[] = [
    ...MAIN_ITEMS,
    signedIn
      ? { href: "/profile", label: "Profile", icon: "user" }
      : { href: "/login", label: "Sign in", icon: "user" },
  ];

  return (
    <>
      <div aria-hidden="true" className="h-[calc(4.25rem+env(safe-area-inset-bottom))] md:hidden" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-paper/90 px-1 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px]",
                active ? "font-semibold text-ink" : "font-medium text-ink-soft",
              )}
            >
              <Icon name={item.icon} className="text-[22px]" strokeWidth={active ? 2 : 1.7} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
