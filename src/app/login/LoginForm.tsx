"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  POST_LOGIN_COOKIE,
  POST_LOGIN_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/auth-redirect";
import { Button } from "@/components/ui/Button";
import { FormNotice, fieldStackClass, labelClass } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";

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
    <main className="flex flex-1 items-start justify-center px-4 pt-10 pb-16 md:items-center md:py-20">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-card md:p-7">
        <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.035em] text-ink">
          Sign in
        </h1>
        <p className="mt-1 text-ink-soft">No password. We&apos;ll email you a link.</p>

        {status === "sent" ? (
          <div
            role="status"
            className="mt-6 flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft px-3.5 py-3 text-sm text-success"
          >
            <Icon name="check" strokeWidth={2.4} className="mt-0.5 text-lg" />
            <p>
              <span className="block font-semibold">Check your inbox</span>
              We sent a sign-in link to{" "}
              <span className="font-semibold break-all">{email}</span>.
            </p>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="mt-6 flex flex-col gap-3">
            <label className={fieldStackClass}>
              <span className={labelClass}>Email</span>
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <Button type="submit" variant="primary" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Send magic link"}
            </Button>
            {error && <FormNotice tone="error">{error}</FormNotice>}
          </form>
        )}

        <div className="my-6 flex items-center gap-3 text-[13px] text-ink-soft">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <Button type="button" variant="ghost" className="w-full" onClick={signInWithGoogle}>
          Continue with Google
        </Button>
        {status === "sent" && error && (
          <FormNotice tone="error" className="mt-3">
            {error}
          </FormNotice>
        )}
        <p className="mt-6 text-center text-[13px] text-ink-soft">
          By continuing you agree to the{" "}
          <Link href="/terms" className="font-medium text-ink underline hover:text-primary">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium text-ink underline hover:text-primary">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
