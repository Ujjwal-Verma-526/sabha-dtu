"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

// The event page has its own sticky Register bar in the same spot.
const HIDDEN_ON = [/^\/events\/[^/]+$/];

/**
 * Bottom tab bar on phones (hidden from md up). Renders a spacer too, so
 * the footer isn't hidden behind the bar.
 */
export function TabBarLinks({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  if (HIDDEN_ON.some((pattern) => pattern.test(pathname))) return null;

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
