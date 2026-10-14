"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MenuItem = { href: string; label: string };

type DropdownMenuProps = {
  label: string;
  items: MenuItem[];
  /** Extra classes for the wrapper (e.g. to hide it at some widths). */
  className?: string;
  /** Classes for the toggle button. */
  buttonClassName?: string;
};

/**
 * Small header dropdown. On narrow screens the panel is pinned to the
 * viewport edges (so long labels truncate instead of overflowing); from `sm`
 * up it hangs off the button.
 */
export function DropdownMenu({
  label,
  items,
  className,
  buttonClassName = "text-sm font-medium text-ink-soft transition-colors hover:text-ink",
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className={buttonClassName}
      >
        {label} <span aria-hidden="true" className="text-[10px]">▾</span>
      </button>
      {open && (
        <ul className="fixed inset-x-4 top-[4rem] z-50 rounded-2xl border border-line bg-surface p-2 shadow-card sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:w-56">
          {items.map((item) => (
            <li key={`${item.href}-${item.label}`}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="block truncate rounded-xl px-3 py-2 text-sm text-ink hover:bg-soft"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
