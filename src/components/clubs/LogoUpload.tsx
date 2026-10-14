"use client";

import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/Spinner";
import { ClubLogo } from "@/components/clubs/ClubLogo";
import {
  IMAGE_BUCKET,
  IMAGE_INPUT_ACCEPT,
  compressImage,
  imageFileProblem,
} from "@/lib/image-upload";

const MAX_DIMENSION = 512;

/**
 * Uploads a club logo to the club's own folder in the public bucket (the
 * same one event banners use; its policies let only this club's managers
 * write there) and submits the resulting public URL as `logo_url`. The save
 * action re-checks that URL, so this component is a convenience, not the
 * guard.
 */
export function LogoUpload({
  clubId,
  clubName,
  defaultValue,
  invalid,
}: {
  clubId: string;
  clubName: string;
  defaultValue: string;
  invalid?: boolean;
}) {
  const inputId = useId();
  const [logoUrl, setLogoUrl] = useState(defaultValue);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    const problem = imageFileProblem(file);
    if (problem) {
      setStatus("error");
      setError(problem);
      input.value = "";
      return;
    }

    setStatus("uploading");
    setError(null);

    try {
      const compressed = await compressImage(file, MAX_DIMENSION);
      const path = `${clubId}/logo-${crypto.randomUUID()}.jpg`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, compressed, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      // Lets the same file be picked again after an error.
      input.value = "";
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input type="hidden" name="logo_url" value={logoUrl} />

      <div className="flex items-center gap-4">
        <ClubLogo
          name={clubName}
          logoUrl={logoUrl || null}
          className={`h-16 w-16 shrink-0 text-lg ${
            invalid ? "ring-2 ring-danger" : ""
          }`}
        />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label
            htmlFor={inputId}
            className="cursor-pointer rounded-lg border border-dashed border-line px-3 py-2 text-sm text-ink-soft hover:border-primary hover:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
          >
            {status === "uploading" ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="h-4 w-4" /> Uploading…
              </span>
            ) : logoUrl ? (
              "Replace logo"
            ) : (
              "Upload logo"
            )}
            <input
              id={inputId}
              type="file"
              accept={IMAGE_INPUT_ACCEPT}
              onChange={handleChange}
              disabled={status === "uploading"}
              className="sr-only"
            />
          </label>
          {logoUrl && status !== "uploading" && (
            <button
              type="button"
              onClick={() => setLogoUrl("")}
              className="text-sm text-ink-soft underline hover:text-ink"
            >
              Remove logo
            </button>
          )}
        </div>
      </div>

      <span className="text-xs text-ink-soft">
        JPEG, PNG or WebP, up to 5 MB. Shown small and square, so a simple
        image works best.
      </span>
      {error && (
        <p role="alert" className="text-sm text-danger [overflow-wrap:anywhere]">
          {error}
        </p>
      )}
    </div>
  );
}
