"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { GlassButton } from "@/components/ui";
import { postJson } from "@/lib/api";
import { FormMessage, PasswordField } from "./fields";

export function ResetForm({ token }: { token?: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "This reset link is missing its token. Request a new one.");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postJson<{ error?: string; message?: string }>("/api/account/reset-password", { token, password });
    setBusy(false);
    if (res.ok) setDone(true);
    else if (res.data.error === "weak_password") setError(res.data.message ?? "Choose a longer password.");
    else if (res.status === 429) setError("Too many attempts. Please wait a few minutes.");
    else setError("This reset link is invalid or has expired. Request a new one.");
  }

  if (done) {
    return (
      <>
        <FormMessage kind="success">Password updated. You have been signed out everywhere, so sign in with your new password.</FormMessage>
        <Link href="/login" className="glass-focus rounded-full text-center font-medium text-accent-strong hover:underline">
          Go to sign in
        </Link>
      </>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <PasswordField label="New password" name="password" autoComplete="new-password" minLength={10} maxLength={128} required hint="At least 10 characters." />
      <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" required />
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <GlassButton type="submit" disabled={busy || !token} className="w-full">
        {busy ? "Saving…" : "Set new password"}
      </GlassButton>
      {!token || error?.includes("invalid") ? (
        <Link href="/forgot" className="glass-focus rounded-full text-center text-sm font-medium text-accent-strong hover:underline">
          Request a new link
        </Link>
      ) : null}
    </form>
  );
}
