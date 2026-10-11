"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

// Reads QR codes from the device camera and hands each new code to onCode.
// It only reads; whether a code is a valid ticket is decided by the caller
// and, ultimately, by check_in_by_token.

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };

type NativeBarcodeDetector = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

const DETECT_INTERVAL_MS = 150;
// The same code is ignored until it has been out of view this long, so a
// ticket held in front of the camera isn't scanned again and again.
const SAME_CODE_COOLDOWN_MS = 4000;

type CameraError =
  | "insecure"
  | "unsupported"
  | "denied"
  | "no_camera"
  | "busy"
  | "detector"
  | "unknown";

const ERROR_MESSAGE: Record<CameraError, string> = {
  insecure: "The camera only works over HTTPS. Open the site's https:// address, or use the code entry below.",
  unsupported: "This browser can't use the camera. Use the code entry or name search below.",
  denied: "Camera access was blocked. Allow the camera for this site in your browser settings, then try again.",
  no_camera: "No camera was found on this device.",
  busy: "The camera is being used by another app. Close it and try again.",
  detector: "The QR reader couldn't load. Check your connection and try again, or use the code entry below.",
  unknown: "The camera couldn't start. Try again, or use the code entry below.",
};

function cameraErrorFrom(error: unknown): CameraError {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no_camera";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "unknown";
}

// Native BarcodeDetector where it reads QR codes (Android Chrome), so
// nothing extra downloads. Otherwise the barcode-detector ponyfill, loaded
// on demand, with its wasm served from /vendor/zxing (copied there by
// scripts/copy-zxing-wasm.mjs) instead of the library's default CDN.
async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeBarcodeDetector }).BarcodeDetector;
  if (Native) {
    try {
      const formats = await Native.getSupportedFormats();
      if (formats.includes("qr_code")) return new Native({ formats: ["qr_code"] });
    } catch (error) {
      console.warn("Native BarcodeDetector unusable, falling back:", error);
    }
  }

  const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import(
    "barcode-detector/ponyfill"
  );
  // fireImmediately loads the wasm now, so a failure shows up here rather
  // than on the first scan.
  await prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? `/vendor/zxing/${ZXING_WASM_VERSION}/${path}` : prefix + path,
    },
    fireImmediately: true,
  });
  return new BarcodeDetector({ formats: ["qr_code"] });
}

export function CameraScanner({
  paused,
  onCode,
}: {
  /** True while a result is showing or a check-in is in flight. */
  paused: boolean;
  onCode: (rawValue: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "starting" | "scanning">("idle");
  const [error, setError] = useState<CameraError | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastCodeRef = useRef<{ value: string; seenAt: number } | null>(null);
  // Read inside the detect loop, which outlives any one render.
  const pausedRef = useRef(paused);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    pausedRef.current = paused;
    onCodeRef.current = onCode;
  }, [paused, onCode]);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    // One detect pass about every DETECT_INTERVAL_MS while the camera runs;
    // stop() ends it by clearing the timer and the stream.
    async function scanOnce() {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || !streamRef.current) return;

      if (!pausedRef.current && video.readyState >= video.HAVE_CURRENT_DATA) {
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue;
          if (value) {
            const now = Date.now();
            const last = lastCodeRef.current;
            const isRepeat =
              last !== null && last.value === value && now - last.seenAt < SAME_CODE_COOLDOWN_MS;
            lastCodeRef.current = { value, seenAt: now };
            if (!isRepeat && !pausedRef.current) onCodeRef.current(value);
          }
        } catch (detectError) {
          // A single bad frame isn't fatal; keep scanning.
          console.warn("QR detect failed on a frame:", detectError);
        }
      }

      if (streamRef.current) {
        timerRef.current = window.setTimeout(scanOnce, DETECT_INTERVAL_MS);
      }
    }

    setError(null);
    if (!window.isSecureContext) {
      setError("insecure");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      return;
    }

    setStatus("starting");
    try {
      detectorRef.current ??= await createDetector();
    } catch (detectorError) {
      console.error("QR detector failed to load:", detectorError);
      setError("detector");
      setStatus("idle");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } catch (mediaError) {
      console.error("Camera failed to start:", mediaError);
      setError(cameraErrorFrom(mediaError));
      setStatus("idle");
      return;
    }

    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((track) => track.stop());
      setStatus("idle");
      return;
    }
    streamRef.current = stream;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (playError) {
      console.error("Camera preview failed to play:", playError);
      stop();
      setError("unknown");
      return;
    }
    setStatus("scanning");
    timerRef.current = window.setTimeout(scanOnce, DETECT_INTERVAL_MS);
  }, [stop]);

  // Release the camera when leaving the page or switching away from the tab.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [stop]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-ink">
        <video
          ref={videoRef}
          playsInline
          muted
          className={status === "scanning" ? "h-full w-full object-cover" : "hidden"}
        />
        {status === "scanning" ? (
          <div
            aria-hidden="true"
            className={
              paused
                ? "pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/30"
                : "pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-accent"
            }
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-sm text-white/80">
              {status === "starting" ? "Starting the camera…" : "Point the camera at a ticket's QR code."}
            </p>
            <Button type="button" variant="accent" onClick={start} disabled={status === "starting"}>
              {status === "starting" ? "Starting…" : "Start camera"}
            </Button>
          </div>
        )}
      </div>

      {status === "scanning" && (
        <Button type="button" variant="ghost" className="self-start text-sm" onClick={stop}>
          Stop camera
        </Button>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {ERROR_MESSAGE[error]}
        </p>
      )}
    </div>
  );
}
