"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
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
          <p className="text-[17px] font-semibold break-words text-ink">{row.name}</p>
          <p
            className={cn(
              "mt-0.5 flex items-center gap-1 text-[13.5px]",
              checkedIn ? "font-semibold text-success" : "font-medium text-ink-soft",
            )}
          >
            {checkedIn && <Icon name="check" strokeWidth={2.6} />}
            {statusLine(row, new Date())}
          </p>
        </div>
        {!checkedIn ? (
          <form action={async () => onCheckIn(row.registration_id)} className="shrink-0">
            <SubmitButton pendingLabel="Checking in…">
              Check in
            </SubmitButton>
          </form>
        ) : (
          !confirmingUndo && (
            <Button
              type="button"
              variant="ghost"
              className="shrink-0"
              onClick={() => setConfirmingUndo(true)}
            >
              Undo
            </Button>
          )
        )}
      </div>

      {checkedIn && confirmingUndo && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft px-3 py-2.5">
          <span className="mr-auto text-sm font-semibold text-danger">Undo this check-in?</span>
          <Button type="button" variant="ghost" onClick={() => setConfirmingUndo(false)}>
            No
          </Button>
          <form
            action={async () => {
              await onUndo(row.registration_id);
              setConfirmingUndo(false);
            }}
          >
            <SubmitButton variant="dangerSolid" pendingLabel="Undoing…">
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
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
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
          <p className="text-[13px] text-ink-soft" role="status">
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
