"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/ui/Button";

type Status = "idle" | "copied" | "manual";

const CONFIRMATION_MS = 2500;

/** Copies text to the clipboard; false if the browser refuses both ways. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No async clipboard (an insecure origin) or permission denied: try the
    // old way, which works from inside a click.
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/**
 * Opens the phone's share sheet (navigator.share) where there is one;
 * otherwise copies the event link and says "Link copied". If the browser
 * won't copy either, the link is shown selected, to copy by hand.
 */
export function ShareButton({
  title,
  text,
  url,
}: {
  title: string;
  /** A line about the event; the link is passed separately. */
  text: string;
  url: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<number | undefined>(undefined);
  const manualField = useRef<HTMLInputElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (status === "manual") manualField.current?.select();
  }, [status]);

  async function handleClick() {
    window.clearTimeout(timer.current);
    const data = { title, text, url };

    if (typeof navigator.share === "function" && (navigator.canShare?.(data) ?? true)) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        // Closing the sheet isn't a failure; anything else falls back to copying.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    if (await copyText(url)) {
      setStatus("copied");
      timer.current = window.setTimeout(() => setStatus("idle"), CONFIRMATION_MS);
    } else {
      setStatus("manual");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={buttonClass("ghost", "min-h-11 text-sm")}
      >
        <Icon name={status === "copied" ? "check" : "share"} className="text-lg" />
        {status === "copied" ? "Link copied" : "Share"}
      </button>
      {/* Announces the confirmation to screen readers. */}
      <span role="status" className="sr-only">
        {status === "copied" ? "Link copied" : ""}
      </span>
      {status === "manual" && (
        <label className="basis-full text-sm">
          <span className="block font-semibold text-ink">Copy this link</span>
          <input
            ref={manualField}
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-control bg-surface px-3 text-ink"
          />
        </label>
      )}
    </>
  );
}
