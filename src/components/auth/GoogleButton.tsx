"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { GlassButton } from "@/components/ui";
import { postJson } from "@/lib/api";
import { FormMessage } from "./fields";

/** With `inviteToken` (sign-up), the invite is parked in a short-lived cookie first so the OAuth callback can use it. */
export function GoogleButton({ inviteToken, label }: { inviteToken?: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    if (inviteToken) {
      const res = await postJson("/api/invite/start", { token: inviteToken });
      if (!res.ok) {
        setBusy(false);
        setError(res.status === 429 ? "Too many attempts. Try again in a few minutes." : "This invite is no longer valid.");
        return;
      }
    }
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <div className="flex flex-col gap-2">
      <GlassButton variant="secondary" onClick={go} disabled={busy} className="w-full">
        {busy ? "Redirecting…" : label}
      </GlassButton>
      {error && <FormMessage kind="error">{error}</FormMessage>}
    </div>
  );
}
