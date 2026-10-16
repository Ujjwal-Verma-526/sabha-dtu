/**
 * Client-side pieces shared by the banner, logo and profile photo uploaders.
 * Banners and logos go to the public `event-banners` bucket under
 * `{club_id}/…`, which the bucket's policies scope to that club's managers
 * (and super admins). Profile photos go to the public `avatars` bucket under
 * `{user_id}/…`, writable only by that user (src/lib/avatar.ts).
 */

/** Must match both buckets' file_size_limit. */
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

/** Must match both buckets' allowed_mime_types. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const IMAGE_INPUT_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

export const IMAGE_BUCKET = "event-banners";

/** A message if the file can't be uploaded, or null if it can. */
export function imageFileProblem(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Use a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_SOURCE_BYTES) return "Image must be under 5 MB.";
  return null;
}

/**
 * Resizes and re-encodes to JPEG via <canvas>, so oversized phone-camera
 * images stay well under the bucket limit without an image library.
 * Transparent areas become white (JPEG has no alpha; canvas would make them
 * black).
 */
export function compressImage(
  file: File,
  maxDimension: number,
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not process image"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
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
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That file isn't a readable image"));
    };

    img.src = objectUrl;
  });
}
