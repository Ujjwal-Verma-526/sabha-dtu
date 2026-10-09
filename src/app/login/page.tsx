import type { Metadata } from "next";
import { safeNextPath } from "@/lib/auth-redirect";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in — Sabha",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const nextParam = Array.isArray(params.next) ? params.next[0] : params.next;
  const errorParam = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <LoginForm
      next={safeNextPath(nextParam)}
      initialError={
        errorParam === "auth_failed"
          ? "That sign-in link didn't work — it may have expired. Please try again."
          : null
      }
    />
  );
}
