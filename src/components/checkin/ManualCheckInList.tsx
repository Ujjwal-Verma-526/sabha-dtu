"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatCheckInTime, type CheckInListRow } from "@/lib/check-in";
import { cn } from "@/lib/utils";

const MIN_QUERY_LENGTH = 2;
const MAX_ROWS = 50;

// Case- and accent-insensitive: "jose" finds "José".
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function statusLine(row: CheckInListRow, now: Date): string {
  if (!row.checked_in_at) return "Not checked in";
  const time = formatCheckInTime(row.checked_in_at, now);
  return row.check_in_method ? `Checked in ${time} · ${row.check_in_method}` : `Checked in ${time}`;
}

function ManualRow({
  row,
  onCheckIn,
  onUndo,
}: {
  row: CheckInListRow;
  onCheckIn: (registrationId: string) => Promise<void>;
  onUndo: (registrationId: string) => Promise<void>;
}) {
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const checkedIn = row.checked_in_at !== null;

  return (
    <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium text-ink">{row.name}</p>
          <p className={cn("font-mono text-xs", checkedIn ? "text-green-700" : "text-ink-soft")}>
            {statusLine(row, new Date())}
          </p>
        </div>
        {!checkedIn ? (
          <form action={async () => onCheckIn(row.registration_id)} className="shrink-0">
            <SubmitButton className="px-4 py-2 text-sm" pendingLabel="Checking in…">
              Check in
            </SubmitButton>
          </form>
        ) : (
          !confirmingUndo && (
            <Button
              type="button"
              variant="ghost"
              className="shrink-0 px-4 py-2 text-sm"
              onClick={() => setConfirmingUndo(true)}
            >
              Undo
            </Button>
          )
        )}
      </div>

      {checkedIn && confirmingUndo && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-soft">Undo this check-in?</span>
          <Button
            type="button"
            variant="ghost"
            className="px-4 py-2 text-sm"
            onClick={() => setConfirmingUndo(false)}
          >
            No
          </Button>
          <form
            action={async () => {
              await onUndo(row.registration_id);
              setConfirmingUndo(false);
            }}
          >
            <SubmitButton
              className="bg-red-600 px-4 py-2 text-sm hover:bg-red-700"
              pendingLabel="Undoing…"
            >
              Yes, undo
            </SubmitButton>
          </form>
        </div>
      )}
    </li>
  );
}

/**
 * Check someone in by name when their QR won't scan. Shows only the name and
 * check-in state that get_event_check_in_list returns; never tokens.
 */
export function ManualCheckInList({
  rows,
  onCheckIn,
  onUndo,
}: {
  rows: CheckInListRow[];
  onCheckIn: (registrationId: string) => Promise<void>;
  onUndo: (registrationId: string) => Promise<void>;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const folded = fold(query.trim());

  const matches = useMemo(
    () => (folded.length >= MIN_QUERY_LENGTH ? rows.filter((row) => fold(row.name).includes(folded)) : []),
    [rows, folded],
  );
  const shown = matches.slice(0, MAX_ROWS);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        Find by name
      </label>
      <Input
        id={inputId}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Type at least ${MIN_QUERY_LENGTH} letters`}
      />

      {folded.length >= MIN_QUERY_LENGTH && (
        <>
          <p className="text-xs text-ink-soft" role="status">
            {matches.length === 0
              ? "No registrant matches that name."
              : matches.length > MAX_ROWS
                ? `Showing ${MAX_ROWS} of ${matches.length}. Type more of the name to narrow it down.`
                : `${matches.length} ${matches.length === 1 ? "match" : "matches"}`}
          </p>
          {shown.length > 0 && (
            <ul className="rounded-2xl border border-line bg-surface px-4">
              {shown.map((row) => (
                <ManualRow
                  key={row.registration_id}
                  row={row}
                  onCheckIn={onCheckIn}
                  onUndo={onUndo}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
