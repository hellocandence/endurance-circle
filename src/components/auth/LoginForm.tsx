"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GlassButton } from "@/components/ui";
import { postJson } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";
import { Field, FormMessage, PasswordField } from "./fields";
import { GoogleButton } from "./GoogleButton";

const OAUTH_ERRORS: Record<string, string> = {
  AccessDenied: "That Google account isn't part of this circle. Ask the owner for an invite.",
};

export function LoginForm({ next, authError, googleEnabled }: { next?: string; authError?: string; googleEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(authError ? (OAUTH_ERRORS[authError] ?? "Sign-in failed. Please try again.") : null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    setBusy(true);
    setError(null);
    setUnverifiedEmail(null);

    const res = await postJson<{ error?: string }>("/api/login", { email, password: String(form.get("password") ?? "") });
    if (res.ok) {
      router.replace(safeNext(next));
      router.refresh();
      return;
    }
    setBusy(false);
    if (res.data.error === "email_not_verified") {
      setUnverifiedEmail(email);
      setError("Please verify your email first. Check your inbox for the link.");
    } else if (res.status === 429) {
      setError("Too many attempts. Please wait a few minutes and try again.");
    } else if (res.status === 0) {
      setError("Can't reach Cadence. Check your connection and try again.");
    } else {
      setError("Incorrect email or password.");
    }
  }

  async function resend() {
    if (!unverifiedEmail) return;
    await postJson("/api/account/resend-verification", { email: unverifiedEmail });
    setResent(true);
  }

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required />
        <PasswordField label="Password" name="password" autoComplete="current-password" required />
        {error && <FormMessage kind="error">{error}</FormMessage>}
        {unverifiedEmail && (
          <GlassButton variant="ghost" onClick={resend} disabled={resent}>
            {resent ? "Verification email sent" : "Resend verification email"}
          </GlassButton>
        )}
        <GlassButton type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </GlassButton>
        <Link href="/forgot" className="glass-focus rounded-full text-center text-sm font-medium text-accent-strong underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      </form>
      {googleEnabled && (
        <>
          <p className="text-center text-sm text-ink-muted">or</p>
          <GoogleButton label="Continue with Google" />
        </>
      )}
    </>
  );
}
