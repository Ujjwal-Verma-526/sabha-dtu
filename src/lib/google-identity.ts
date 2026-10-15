/**
 * Google Identity Services (GIS): loading Google's sign-in script and the
 * nonce for supabase.auth.signInWithIdToken.
 *
 * The button gets an ID token from Google in a popup on accounts.google.com,
 * so Google's consent screen names our own site rather than the Supabase
 * project's address. The script and its iframe/stylesheet origins are
 * allowed in the CSP (next.config.ts); change both together.
 */

export const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** How long to wait for the script before falling back to the redirect flow. */
export const GIS_LOAD_TIMEOUT_MS = 6000;

/** The Google OAuth web client ID (public, not a secret), or null if unset. */
export function googleClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return id ? id : null;
}

// Just the parts of the GIS API we use.
export type GoogleCredentialResponse = { credential?: string };

type GoogleIdApi = {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    nonce?: string;
    auto_select?: boolean;
    context?: "signin" | "signup" | "use";
    ux_mode?: "popup" | "redirect";
    itp_support?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number;
      locale?: string;
    },
  ): void;
  cancel(): void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

let scriptPromise: Promise<GoogleIdApi> | null = null;

/**
 * Loads the GIS script once per page. Rejects if it fails to load (blocked
 * by an extension or network, an in-app browser that strips it) or doesn't
 * finish within GIS_LOAD_TIMEOUT_MS; a later call tries again.
 */
export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(
      () => fail(new Error("Google sign-in script timed out")),
      GIS_LOAD_TIMEOUT_MS,
    );

    function fail(error: Error) {
      window.clearTimeout(timer);
      script.remove();
      scriptPromise = null;
      reject(error);
    }

    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      const api = window.google?.accounts?.id;
      if (!api) {
        fail(new Error("Google sign-in script loaded without its API"));
        return;
      }
      window.clearTimeout(timer);
      resolve(api);
    };
    script.onerror = () => fail(new Error("Google sign-in script failed to load"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * A fresh nonce pair, as Supabase's Google guide does it: the raw nonce goes
 * to signInWithIdToken, its SHA-256 (lowercase hex) goes to Google, which
 * puts it in the ID token. Supabase hashes the raw one and compares, so a
 * token can't be replayed into a different sign-in attempt.
 */
export async function createNoncePair(): Promise<{ nonce: string; hashedNonce: string }> {
  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  );
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashedNonce = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { nonce, hashedNonce };
}
