"use client";

import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/Icon";
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
        <div className="aspect-[5/4] w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-soft">
          {/* Freshly uploaded/local preview — no remote pattern to configure */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <label
        htmlFor={inputId}
        className="flex cursor-pointer items-center gap-3.5 rounded-2xl border-[1.5px] border-dashed border-control p-4 hover:border-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-soft text-xl text-ink">
          {status === "uploading" ? <Spinner className="h-5 w-5" /> : <Icon name="image" />}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-ink">
            {status === "uploading"
              ? "Uploading…"
              : preview
                ? "Replace the poster"
                : "Add a poster"}
          </span>
          <span className="block text-[13px] text-ink-soft">
            JPEG, PNG or WebP, up to 5 MB; it&apos;s resized for you. Skip it and Sabha makes a
            cover from the title and category.
          </span>
        </span>
        <input
          id={inputId}
          type="file"
          accept={IMAGE_INPUT_ACCEPT}
          onChange={handleChange}
          disabled={status === "uploading"}
          className="sr-only"
        />
      </label>

      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger [overflow-wrap:anywhere]">
          {error}
        </p>
      )}
    </div>
  );
}
