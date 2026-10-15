"use client";

import { useEffect } from "react";
import type { ResultTone, ResultView } from "@/lib/check-in";
import { cn } from "@/lib/utils";

// How long a result stays up before the scanner takes the next ticket. Long
// enough to read a name; amber/red stay longer because someone has to act.
const AUTO_DISMISS_MS: Record<ResultTone, number> = {
  success: 2500,
  warning: 4000,
  error: 4000,
};

const VIBRATION: Record<ResultTone, number[]> = {
  success: [80],
  warning: [60, 60, 60],
  error: [200, 80, 200],
};

// Solid panels, readable at arm's length: the colour is a second signal,
// never the only one. Every result also has its own icon shape and a
// written title ("Checked in", "Already checked in", "Not a valid ticket").
const toneClass: Record<ResultTone, string> = {
  success: "bg-success text-on-success",
  warning: "bg-warning text-on-warning",
  error: "bg-danger text-on-danger",
};

function ToneIcon({ tone }: { tone: ResultTone }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] border-current md:h-20 md:w-20"
    >
      <svg viewBox="0 0 24 24" className="h-9 w-9 md:h-11 md:w-11" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        {tone === "success" && <path d="M5 12.5l4.5 4.5L19 7.5" />}
        {tone === "warning" && (
          <>
            <path d="M12 6v7" />
            <path d="M12 17.5v.5" />
          </>
        )}
        {tone === "error" && (
          <>
            <path d="M7 7l10 10" />
            <path d="M17 7L7 17" />
          </>
        )}
      </svg>
    </span>
  );
}

/**
 * The live region is always rendered (empty when there's no result) so a
 * screen reader announces each new result as soon as it appears.
 */
export function ScanResult({
  result,
  onDismiss,
}: {
  // `key` changes for every new result, so a repeat of the same outcome
  // still restarts the timer and the vibration.
  result: { view: ResultView; key: number } | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!result) return;
    navigator.vibrate?.(VIBRATION[result.view.tone]);
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS[result.view.tone]);
    return () => window.clearTimeout(timer);
  }, [result, onDismiss]);

  return (
    <div aria-live="assertive" aria-atomic="true">
      {result && (
        <div
          className={cn(
            "mb-4 flex flex-col gap-5 rounded-2xl p-5 shadow-card md:p-6",
            toneClass[result.view.tone],
          )}
        >
          <div className="flex items-center gap-4">
            <ToneIcon tone={result.view.tone} />
            <div className="min-w-0">
              <p className="text-[30px] leading-[1.05] font-bold tracking-[-0.025em] md:text-[38px]">
                {result.view.title}
              </p>
              <p className="mt-1.5 text-xl leading-snug font-semibold break-words md:text-2xl">
                {result.view.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-12 w-full rounded-xl border-2 border-current text-base font-semibold focus-visible:outline-current"
          >
            Scan next
          </button>
        </div>
      )}
    </div>
  );
}
