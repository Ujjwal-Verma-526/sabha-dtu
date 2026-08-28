"use client";

import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/Spinner";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024; // must match the bucket's file_size_limit
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Resizes/re-encodes to JPEG client-side via <canvas> before upload — no
// image library needed for a "keep the first implementation simple" MVP,
// and it keeps oversized phone-camera banners well under the bucket limit.
function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not process image"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error("Could not process image"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That file isn't a readable image"));
    };

    img.src = objectUrl;
  });
}

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

    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus("error");
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setStatus("error");
      setError("Image must be under 5 MB.");
      return;
    }

    setStatus("uploading");
    setError(null);

    try {
      const compressed = await compressImage(file);
      const path = `${clubId}/${crypto.randomUUID()}.jpg`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("event-banners")
        .upload(path, compressed, { contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("event-banners")
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
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        disabled={status === "uploading"}
        className="sr-only"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
