"use client";

import { useState, type FormEvent } from "react";
import { FormMessage, PasswordField } from "@/components/auth/fields";
import { GlassButton } from "@/components/ui";
import { postJson } from "@/lib/api";
import { Section, type Status } from "./Section";

const MESSAGES: Record<string, string> = {
  wrong_password: "Your current password isn't right.",
  same_password: "Choose a password different from your current one.",
  no_password: "This account signs in with Google. Use \"Forgot your password?\" on the sign-in page to set a password.",
};

export function SecurityForm({ hasPassword }: { hasPassword: boolean }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [confirmOut, setConfirmOut] = useState(false);

  async function onChange(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const next = String(data.get("next") ?? "");
    if (next !== String(data.get("confirm") ?? "")) return setStatus({ kind: "error", text: "The new passwords don't match." });

    setStatus({ kind: "saving" });
    const res = await postJson<{ error?: string; message?: string; signedOutOthers?: number }>("/api/account/change-password", {
      currentPassword: String(data.get("current") ?? ""),
      newPassword: next,
    });
    if (res.ok) {
      form.reset();
      const n = res.data.signedOutOthers ?? 0;
      setStatus({ kind: "ok", text: n > 0 ? `Password changed. ${n} other ${n === 1 ? "device was" : "devices were"} signed out.` : "Password changed." });
    } else if (res.status === 429) {
      setStatus({ kind: "error", text: "Too many attempts. Please wait a few minutes." });
    } else {
      setStatus({ kind: "error", text: res.data.message ?? MESSAGES[res.data.error ?? ""] ?? "Couldn't change the password." });
    }
  }

  async function signOutAll() {
    setStatus({ kind: "saving" });
    const res = await postJson("/api/account/sign-out-all", {});
    if (res.ok) window.location.assign("/login");
    else setStatus({ kind: "error", text: "Couldn't sign out. Please try again." });
  }

  return (
    <Section title="Security" description="Change your password or sign out everywhere.">
      {hasPassword ? (
        <form onSubmit={onChange} className="flex flex-col gap-4">
          <PasswordField label="Current password" name="current" autoComplete="current-password" required />
          <PasswordField label="New password" name="next" autoComplete="new-password" minLength={10} maxLength={128} required hint="At least 10 characters. Your other devices will be signed out." />
          <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" required />
          <GlassButton type="submit" disabled={status.kind === "saving"} className="w-full">Change password</GlassButton>
        </form>
      ) : (
        <p className="text-sm text-ink-muted">{MESSAGES.no_password}</p>
      )}
      <div aria-live="polite">
        {status.kind === "ok" && <FormMessage kind="success">{status.text}</FormMessage>}
        {status.kind === "error" && <FormMessage kind="error">{status.text}</FormMessage>}
      </div>
      <div className="border-t border-white/60 pt-4">
        {confirmOut ? (
          <div className="flex flex-col gap-2" role="group" aria-label="Confirm sign out everywhere">
            <p className="text-sm font-medium">Sign out of every device, including this one?</p>
            <div className="flex gap-2">
              <GlassButton onClick={signOutAll} className="flex-1">Yes, sign out everywhere</GlassButton>
              <GlassButton variant="secondary" onClick={() => setConfirmOut(false)} className="flex-1">Cancel</GlassButton>
            </div>
          </div>
        ) : (
          <GlassButton variant="secondary" onClick={() => setConfirmOut(true)} className="w-full">Sign out of all devices</GlassButton>
        )}
      </div>
    </Section>
  );
}
