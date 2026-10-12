"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  POST_LOGIN_COOKIE,
  POST_LOGIN_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/auth-redirect";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type LoginFormProps = {
  /** Already-validated same-site path to return to after sign-in, or null. */
  next: string | null;
  /** Message to show on first render (e.g. a failed callback). */
  initialError: string | null;
};

// Remembers (or clears) where to send the user once /auth/callback has
// exchanged the code. Clearing matters: an abandoned earlier attempt must not
// redirect a later plain sign-in.
function rememberDestination(next: string | null) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  if (next) {
    document.cookie = `${POST_LOGIN_COOKIE}=${encodeURIComponent(next)}; Path=/; Max-Age=${POST_LOGIN_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  } else {
    document.cookie = `${POST_LOGIN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
}

export function LoginForm({ next, initialError }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(initialError);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    rememberDestination(next);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }
    setStatus("sent");
  }

  async function signInWithGoogle() {
    setError(null);
    rememberDestination(next);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus("error");
      setError(error.message);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <Card className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-soft">
          No password — we&apos;ll email you a link.
        </p>

        {status === "sent" ? (
          <p className="mt-6 text-sm text-ink">
            Check <span className="font-medium">{email}</span> for a sign-in
            link.
          </p>
        ) : (
          <form onSubmit={sendMagicLink} className="mt-6 flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={status === "sending"}
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        )}

        <div className="my-6 flex items-center gap-3 text-xs text-ink-soft">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={signInWithGoogle}
        >
          Continue with Google
        </Button>
        {status === "sent" && error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}
        <p className="mt-6 text-center text-xs text-ink-soft">
          By continuing you agree to the{" "}
          <Link href="/terms" className="underline hover:text-ink">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-ink">
            Privacy Policy
          </Link>
          .
        </p>
      </Card>
    </main>
  );
}
