"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
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

const toneClass: Record<ResultTone, string> = {
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  error: "border-danger-line bg-danger-soft text-danger",
};

const iconClass: Record<ResultTone, string> = {
  success: "bg-green-600",
  warning: "bg-amber-500",
  error: "bg-red-600",
};

function ToneIcon({ tone }: { tone: ResultTone }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white",
        iconClass[tone],
      )}
    >
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
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
            "mb-4 flex flex-col gap-4 rounded-2xl border-2 p-5",
            toneClass[result.view.tone],
          )}
        >
          <div className="flex items-center gap-4">
            <ToneIcon tone={result.view.tone} />
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold leading-tight">
                {result.view.title}
              </p>
              <p className="mt-1 break-words text-base font-medium">{result.view.message}</p>
            </div>
          </div>
          <Button type="button" variant="ghost" className="w-full" onClick={onDismiss}>
            Scan next
          </Button>
        </div>
      )}
    </div>
  );
}
