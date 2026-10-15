"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraScanner } from "@/components/checkin/CameraScanner";
import { ManualCheckInList } from "@/components/checkin/ManualCheckInList";
import { ScanResult } from "@/components/checkin/ScanResult";
import { TokenEntryForm } from "@/components/checkin/TokenEntryForm";
import {
  describeResult,
  NOT_A_TICKET,
  type CheckInActionResult,
  type CheckInCounts,
  type CheckInListRow,
  type ResultView,
} from "@/lib/check-in";
import { isTicketToken, normalizeTicketToken } from "@/lib/ticket-token";

// Keeps several doors roughly in sync on the same event.
const COUNTS_POLL_MS = 20_000;

export type CheckInActions = {
  checkInByToken: (eventId: string, token: string) => Promise<CheckInActionResult>;
  manualCheckIn: (eventId: string, registrationId: string) => Promise<CheckInActionResult>;
  undoCheckIn: (eventId: string, registrationId: string) => Promise<CheckInActionResult>;
  getCheckInCounts: (eventId: string) => Promise<CheckInCounts | null>;
};

export function CheckInConsole({
  eventId,
  initialCounts,
  initialRows,
  actions,
}: {
  eventId: string;
  initialCounts: CheckInCounts;
  initialRows: CheckInListRow[];
  actions: CheckInActions;
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [rows, setRows] = useState(initialRows);
  const [result, setResult] = useState<{ view: ResultView; key: number } | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const resultKey = useRef(0);

  const showResult = useCallback((view: ResultView) => {
    resultKey.current += 1;
    setResult({ view, key: resultKey.current });
  }, []);

  const dismissResult = useCallback(() => setResult(null), []);

  // Runs one check-in action and applies what came back: the big result,
  // the counter, and the matching row in the name list.
  const run = useCallback(
    async (call: () => Promise<CheckInActionResult>, method: "scan" | "manual" | "undo") => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setPending(true);
      try {
        const response = await call();
        if (response.counts) setCounts(response.counts);

        if (!response.ok) {
          showResult({ tone: "error", title: "Couldn't check in", message: response.error });
          return;
        }

        const { result: outcome } = response;
        if (outcome.registration_id) {
          setRows((current) =>
            current.map((row) => {
              if (row.registration_id !== outcome.registration_id) return row;
              if (outcome.outcome === "undone") {
                return { ...row, checked_in_at: null, check_in_method: null };
              }
              if (outcome.outcome === "checked_in") {
                return {
                  ...row,
                  checked_in_at: outcome.checked_in_at,
                  check_in_method: method === "undo" ? null : method,
                };
              }
              if (outcome.outcome === "already_checked_in") {
                return { ...row, checked_in_at: outcome.checked_in_at };
              }
              return row;
            }),
          );
        }
        showResult(describeResult(outcome, new Date()));
      } catch (error) {
        console.error("Check-in request failed:", error);
        showResult({
          tone: "error",
          title: "No connection",
          message: "The check-in didn't go through. Check the connection and scan again.",
        });
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [showResult],
  );

  const handleCode = useCallback(
    (rawValue: string) => {
      if (pendingRef.current) return;
      if (!isTicketToken(rawValue)) {
        showResult(NOT_A_TICKET);
        return;
      }
      const token = normalizeTicketToken(rawValue);
      void run(() => actions.checkInByToken(eventId, token), "scan");
    },
    [actions, eventId, run, showResult],
  );

  const handleTypedToken = useCallback(
    (token: string) => run(() => actions.checkInByToken(eventId, token), "scan"),
    [actions, eventId, run],
  );

  const handleManual = useCallback(
    (registrationId: string) => run(() => actions.manualCheckIn(eventId, registrationId), "manual"),
    [actions, eventId, run],
  );

  const handleUndo = useCallback(
    (registrationId: string) => run(() => actions.undoCheckIn(eventId, registrationId), "undo"),
    [actions, eventId, run],
  );

  // Refresh the counter while the page is visible and nothing is in flight.
  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || pendingRef.current) return;
      try {
        const fresh = await actions.getCheckInCounts(eventId);
        if (fresh) setCounts(fresh);
      } catch (error) {
        console.warn("Refreshing check-in counts failed:", error);
      }
    }, COUNTS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [actions, eventId]);

  return (
    <div className="flex flex-col gap-6">
      <p className="flex flex-wrap items-baseline gap-x-2 rounded-2xl border border-line bg-surface px-5 py-4 text-ink">
        <span className="text-[44px] leading-none font-bold tracking-[-0.03em] tabular-nums">
          {counts.checkedIn}
        </span>
        <span className="text-2xl font-semibold text-ink-soft tabular-nums">/ {counts.registered}</span>
        <span className="text-base font-medium text-ink-soft">checked in</span>
      </p>

      {/* Grouped so the (usually empty) live region adds no gap. */}
      <div>
        <ScanResult result={result} onDismiss={dismissResult} />
        <CameraScanner paused={pending || result !== null} onCode={handleCode} />
      </div>

      <TokenEntryForm onSubmit={handleTypedToken} />

      <ManualCheckInList rows={rows} onCheckIn={handleManual} onUndo={handleUndo} />
    </div>
  );
}
