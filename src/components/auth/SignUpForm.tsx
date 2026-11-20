"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { GlassButton } from "@/components/ui";
import { postJson } from "@/lib/api";
import { Field, FormMessage, PasswordField } from "./fields";
import { GoogleButton } from "./GoogleButton";

export function SignUpForm({ token, googleEnabled }: { token: string; googleEnabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const email = String(form.get("email") ?? "");
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
    else setError("Please check your details and try again.");
  }

  if (sentTo) {
    return (
      <>
        <FormMessage kind="success">Check {sentTo} for a verification link. Once confirmed, you can sign in.</FormMessage>
        <Link href="/login" className="glass-focus rounded-full text-center font-medium text-accent-strong hover:underline">
          Go to sign in
        </Link>
      </>
    );
  }
  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Your name" name="name" autoComplete="name" maxLength={80} required />
        <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required />
        <PasswordField label="Password" name="password" autoComplete="new-password" minLength={10} maxLength={128} required hint="At least 10 characters." />
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <GlassButton type="submit" disabled={busy} className="w-full">
          {busy ? "Creating account…" : "Create account"}
        </GlassButton>
      </form>
      {googleEnabled && (
        <>
          <p className="text-center text-sm text-ink-muted">or</p>
          <GoogleButton inviteToken={token} label="Sign up with Google" />
        </>
      )}
    </>
  );
}
