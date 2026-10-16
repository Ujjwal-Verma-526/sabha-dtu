"use client";

import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { AVATAR_BUCKET, AVATAR_MAX_DIMENSION, avatarSrc, newAvatarPath } from "@/lib/avatar";
import { IMAGE_INPUT_ACCEPT, compressImage, imageFileProblem } from "@/lib/image-upload";
import type { ProfilePhotoResult } from "@/app/profile/actions";

type Status =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

/**
 * The /profile photo: upload (or replace) and remove, each saved straight
 * away. The browser resizes the picture and uploads it to the user's own
 * folder in the avatars bucket (the bucket's policies allow nothing else),
 * then `save` stores its URL; the save action re-checks that URL and clears
 * out the previous file, so this component is a convenience, not the guard.
 */
export function ProfilePhoto({
  userId,
  name,
  initialAvatarUrl,
  save,
}: {
  userId: string;
  name: string;
  /** The stored avatar_url, which Avatar only shows if it's in our bucket. */
  initialAvatarUrl: string | null;
  save: (url: string | null) => Promise<ProfilePhotoResult>;
}) {
  const inputId = useId();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "busy";
  // An old external avatar_url counts as no photo: it's never shown.
  const hasPhoto = avatarSrc(avatarUrl, userId) !== null;

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    // Lets the same file be picked again after an error.
    input.value = "";
    if (!file) return;

    const problem = imageFileProblem(file);
    if (problem) {
      setStatus({ kind: "error", message: problem });
      return;
    }

    setStatus({ kind: "busy", label: "Uploading…" });
    const supabase = createClient();
    const bucket = supabase.storage.from(AVATAR_BUCKET);
    const path = newAvatarPath(userId);
    try {
      const compressed = await compressImage(file, AVATAR_MAX_DIMENSION);
      // Every upload gets a new name, so its URL can be cached for good.
      const { error: uploadError } = await bucket.upload(path, compressed, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
      });
      if (uploadError) throw uploadError;

      const { data } = bucket.getPublicUrl(path);
      const result = await save(data.publicUrl);
      if (!result.ok) {
        // Best effort; the next successful save clears it out anyway.
        await bucket.remove([path]);
        setStatus({ kind: "error", message: result.error });
        return;
      }
      setAvatarUrl(result.avatarUrl);
      setStatus({ kind: "done", message: "Photo updated" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Upload failed. Try again.",
      });
    }
  }

  async function handleRemove() {
    setStatus({ kind: "busy", label: "Removing…" });
    try {
      const result = await save(null);
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error });
        return;
      }
      setAvatarUrl(null);
      setStatus({ kind: "done", message: "Photo removed" });
    } catch {
      setStatus({ kind: "error", message: "Your photo couldn't be removed. Try again." });
    }
  }

  return (
    <div className="mt-3 flex items-center gap-4">
      <Avatar name={name} avatarUrl={avatarUrl} userId={userId} className="h-20 w-20 text-2xl" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={inputId}
            className={`inline-flex min-h-11 items-center rounded-xl border border-dashed border-control px-4 text-[15px] font-semibold text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
              busy ? "cursor-default opacity-70" : "cursor-pointer hover:border-ink"
            }`}
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="h-4 w-4" /> {status.label}
              </span>
            ) : hasPhoto ? (
              "Replace photo"
            ) : (
              "Upload photo"
            )}
            <input
              id={inputId}
              type="file"
              accept={IMAGE_INPUT_ACCEPT}
              onChange={handleChange}
              disabled={busy}
              className="sr-only"
            />
          </label>
          {hasPhoto && !busy && (
            <button
              type="button"
              onClick={handleRemove}
              className="min-h-11 px-1 text-sm font-medium text-ink-soft underline hover:text-ink"
            >
              Remove photo
            </button>
          )}
        </div>
        <span className="text-[13px] leading-snug text-ink-soft">
          JPEG, PNG or WebP, up to 5 MB. Shown next to your name.
        </span>
        {/* Always rendered, so screen readers announce "Photo updated". */}
        <p role="status" className="text-[13px] font-medium text-success">
          {status.kind === "done" ? status.message : ""}
        </p>
        {status.kind === "error" && (
          <p role="alert" className="text-[13px] font-medium text-danger [overflow-wrap:anywhere]">
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}
