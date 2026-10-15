"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createNoncePair,
  googleClientId,
  loadGoogleIdentity,
  type GoogleCredentialResponse,
} from "@/lib/google-identity";
import { Button } from "@/components/ui/Button";
import { FormNotice } from "@/components/ui/Field";

type GoogleSignInProps = {
  /** Already-validated same-site path to return to after sign-in, or null. */
  next: string | null;
  /** The redirect sign-in (Google's page via Supabase), used as the fallback. */
  onRedirectSignIn: () => void;
};

type State = "loading" | "ready" | "signing-in" | "fallback";

// The GIS button can't be narrower or wider than this.
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

/**
 * Google's own "Continue with Google" button (Google Identity Services). It
 * gets an ID token in a popup and hands it to Supabase, so the session is set
 * right here, with no trip through /auth/callback. Falls back to the redirect
 * button when there is no client ID, no Web Crypto, or the script doesn't
 * load (blocked, offline, an in-app browser).
 */
export function GoogleSignIn({ next, onRedirectSignIn }: GoogleSignInProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  // The raw nonce for the current button; Google only ever sees its hash.
  const nonceRef = useRef<string | null>(null);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setUp(): Promise<void> {
      const clientId = googleClientId();
      if (!clientId || !window.crypto?.subtle) {
        setState("fallback");
        return;
      }
      try {
        const api = await loadGoogleIdentity();
        const { nonce, hashedNonce } = await createNoncePair();
        const wrap = wrapRef.current;
        const target = buttonRef.current;
        if (cancelled || !wrap || !target) return;

        nonceRef.current = nonce;
        api.initialize({
          client_id: clientId,
          callback: (response) => void handleCredential(response),
          nonce: hashedNonce,
          auto_select: false,
          context: "signin",
          ux_mode: "popup",
          itp_support: true,
        });
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        target.replaceChildren();
        api.renderButton(target, {
          type: "standard",
          theme: dark ? "filled_black" : "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "center",
          width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, wrap.clientWidth)),
          locale: "en",
        });
        setState("ready");
      } catch (e) {
        if (cancelled) return;
        console.warn("Google sign-in button unavailable, using redirect:", e);
        setState("fallback");
      }
    }

    async function handleCredential(response: GoogleCredentialResponse) {
      const nonce = nonceRef.current;
      if (!response.credential || !nonce) {
        setError("Google sign-in didn't finish. Please try again.");
        return;
      }
      // One nonce per attempt: whatever happens next, this one is spent.
      nonceRef.current = null;
      setError(null);
      setState("signing-in");

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
        nonce,
      });
      if (error) {
        console.error("Google sign-in failed:", error.message);
        setError("Google sign-in didn't work. Please try again.");
        // A fresh nonce and button for the next try.
        await setUp();
        return;
      }
      // A full load, so the server renders the next page with the new session.
      window.location.replace(next ?? "/profile");
    }

    void setUp();
    return () => {
      cancelled = true;
    };
  }, [next]);

  if (state === "fallback") {
    return (
      <Button type="button" variant="ghost" className="w-full" onClick={onRedirectSignIn}>
        Continue with Google
      </Button>
    );
  }

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative min-h-11"
        aria-busy={state === "loading" || state === "signing-in"}
      >
        {state === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-line bg-soft text-[13px] text-ink-soft">
            Loading Google sign-in…
          </div>
        )}
        {/* Google renders its button iframe in here; React keeps out of it. */}
        <div
          ref={buttonRef}
          className={state === "signing-in" ? "pointer-events-none flex justify-center opacity-60" : "flex justify-center"}
        />
      </div>
      {state === "signing-in" && (
        <p role="status" className="mt-3 text-center text-[13px] text-ink-soft">
          Signing you in…
        </p>
      )}
      {error && (
        <FormNotice tone="error" className="mt-3">
          {error}
        </FormNotice>
      )}
      {state !== "signing-in" && (
        <p className="mt-3 text-center text-[13px] text-ink-soft">
          Google button not working?{" "}
          <button
            type="button"
            onClick={onRedirectSignIn}
            className="font-medium text-ink underline hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Continue on Google&apos;s page
          </button>
        </p>
      )}
    </div>
  );
}
