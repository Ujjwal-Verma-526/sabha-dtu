"use client";

import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/Spinner";
import {
  IMAGE_BUCKET,
  IMAGE_INPUT_ACCEPT,
  compressImage,
  imageFileProblem,
} from "@/lib/image-upload";

const MAX_DIMENSION = 1600;

export function BannerUpload({
  clubId,
  defaultValue,
}: {
  clubId: string;
  defaultValue?: string | null;
}) {
  const inputId = useId();
  const [preview, setPreview] = useState<string | null>(defaultValue ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(
    defaultValue ?? null,
  );
  const [status, setStatus] = useState<"idle" | "uploading" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const problem = imageFileProblem(file);
    if (problem) {
      setStatus("error");
      setError(problem);
      return;
    }

    setStatus("uploading");
    setError(null);

    try {
      const compressed = await compressImage(file, MAX_DIMENSION);
      const path = `${clubId}/${crypto.randomUUID()}.jpg`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, compressed, { contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from(IMAGE_BUCKET)
        .getPublicUrl(path);

      setBannerUrl(data.publicUrl);
      setPreview(data.publicUrl);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="banner_url" value={bannerUrl ?? ""} />

      {preview && (
        <div className="aspect-[16/9] w-full overflow-hidden rounded-lg border border-line bg-ink/5">
          {/* Freshly uploaded/local preview — no remote pattern to configure */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <label
        htmlFor={inputId}
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-sm text-ink-soft hover:border-primary hover:text-ink"
      >
        {status === "uploading" ? (
          <>
            <Spinner className="h-4 w-4" /> Uploading…
          </>
        ) : preview ? (
          "Replace banner image"
        ) : (
          "Upload banner image"
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
        onChange={handleChange}
        disabled={status === "uploading"}
        className="sr-only"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
