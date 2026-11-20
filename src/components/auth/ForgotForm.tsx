"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { GlassButton } from "@/components/ui";
import { postJson } from "@/lib/api";
import { Field, FormMessage } from "./fields";

export function ForgotForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    const res = await postJson("/api/account/forgot-password", { email });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.status === 429 ? "Too many requests. Please wait a few minutes." : "Enter a valid email address.");
  }

  if (done) {
    return (
      <>
        <FormMessage kind="success">If that email has a Cadence account, a reset link is on its way. It works once and expires in 30 minutes.</FormMessage>
        <Link href="/login" className="glass-focus rounded-full text-center text-sm font-medium text-accent-strong hover:underline">
          Back to sign in
        </Link>
      </>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required />
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <GlassButton type="submit" disabled={busy} className="w-full">
        {busy ? "Sending…" : "Send reset link"}
      </GlassButton>
      <Link href="/login" className="glass-focus rounded-full text-center text-sm font-medium text-accent-strong hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
