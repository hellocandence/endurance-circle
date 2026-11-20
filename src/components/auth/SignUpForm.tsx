"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { GlassButton } from "@/components/ui";
import { postJson } from "@/lib/api";
import { Field, FormMessage, PasswordField } from "./fields";
import { GoogleButton } from "./GoogleButton";

/** `lockedEmail`: the invite was sent to this address, so it is shown read-only and both sign-up methods must use it. */
export function SignUpForm({ token, googleEnabled, lockedEmail = null }: { token: string; googleEnabled: boolean; lockedEmail?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const email = lockedEmail ?? String(form.get("email") ?? "");
    const res = await postJson<{ error?: string; message?: string }>("/api/signup", {
      token,
      email,
      name: String(form.get("name") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setBusy(false);
    if (res.ok) setSentTo(email);
    else if (res.data.error === "weak_password") setError(res.data.message ?? "Choose a longer password.");
    else if (res.status === 429) setError("Too many attempts. Please wait a few minutes.");
    else if (res.data.error === "invalid_invite") setError("This invite is no longer valid. Ask the owner for a new one.");
    else if (res.data.error === "email_mismatch") setError("This invite was sent to a different email address.");
    else setError("Please check your details and try again.");
  }

  if (sentTo) {
    return (
      <>
        <FormMessage kind="success">
          {lockedEmail ? `Your account is ready. Sign in with ${sentTo} and your password, or with Google.` : `Check ${sentTo} for a verification link. Once confirmed, you can sign in.`}
        </FormMessage>
        <Link href="/login" className="glass-focus rounded-full text-center font-medium text-accent-strong hover:underline">
          Go to sign in
        </Link>
      </>
    );
  }
  return (
    <>
      {googleEnabled && (
        <>
          <GoogleButton inviteToken={token} loginHint={lockedEmail ?? undefined} label="Continue with Google" />
          <p className="text-center text-sm text-ink-muted">or create an account with a password</p>
        </>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Your name" name="name" autoComplete="name" maxLength={80} required />
        {lockedEmail ? (
          <Field label="Email" name="email" type="email" value={lockedEmail} readOnly aria-readonly hint="Your invite was sent to this address." />
        ) : (
          <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required />
        )}
        <PasswordField label="Password" name="password" autoComplete="new-password" minLength={10} maxLength={128} required hint="At least 10 characters." />
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <GlassButton type="submit" disabled={busy} className="w-full">
          {busy ? "Creating account…" : "Create account"}
        </GlassButton>
      </form>
    </>
  );
}
