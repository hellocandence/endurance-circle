"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { GlassButton } from "@/components/ui";
import { postJson } from "@/lib/api";
import { FormMessage } from "./fields";

/** The multicolour Google "G" (brand colours, as Google's sign-in guidelines ask). */
function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** With `inviteToken` (sign-up), the invite is parked in a short-lived cookie first so the OAuth callback can use it. */
export function GoogleButton({ inviteToken, label, loginHint }: { inviteToken?: string; label: string; loginHint?: string }) {
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
    await signIn("google", { callbackUrl: "/dashboard" }, loginHint ? { login_hint: loginHint } : undefined);
  }

  return (
    <div className="flex flex-col gap-2">
      <GlassButton variant="secondary" onClick={go} disabled={busy} className="w-full gap-3 bg-white font-semibold text-ink shadow-glass-press">
        <GoogleLogo />
        {busy ? "Redirecting…" : label}
      </GlassButton>
      {error && <FormMessage kind="error">{error}</FormMessage>}
    </div>
  );
}
