"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Club = { id: string; name: string };

/** "Manage" dropdown for people who manage several clubs. */
export function ManageMenu({ clubs }: { clubs: Club[] }) {
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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className="text-[13px] font-medium text-ink-soft transition-colors hover:text-ink sm:text-sm"
      >
        Manage <span aria-hidden="true" className="text-[10px]">▾</span>
      </button>
      {open && (
        <ul className="fixed inset-x-4 top-[4.25rem] z-50 rounded-2xl border border-line bg-surface p-2 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:w-56">
          {clubs.map((club) => (
            <li key={club.id}>
              <Link
                href={`/admin/clubs/${club.id}`}
                onClick={() => setOpen(false)}
                className="block truncate rounded-xl px-3 py-2 text-sm text-ink hover:bg-ink/5"
              >
                {club.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
