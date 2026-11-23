"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormMessage } from "@/components/auth/fields";
import { Toggle } from "@/components/today/controls";
import { GlassButton, useToast } from "@/components/ui";
import { postJson, sendJson } from "@/lib/api";
import type { MySettings } from "@/server/ec/service";
import { Section, type Status } from "@/components/settings/Section";

export function EcReminders({ mine }: { mine: MySettings }) {
  const router = useRouter();
  const toast = useToast();
  const [number, setNumber] = useState(mine.whatsappNumber ?? "");
  const [enabled, setEnabled] = useState(mine.enabled);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const res = await sendJson<{ issues?: { message: string }[]; enabled?: boolean }>("PUT", "/api/ec/me", { whatsappNumber: number, enabled });
    if (res.ok) {
      setEnabled(res.data.enabled ?? false);
      const needsNumber = enabled && !res.data.enabled;
      const text = needsNumber ? "Saved, but tagging stays off until you add a number." : "Saved.";
      setStatus({ kind: "ok", text });
      toast(needsNumber ? "Saved. Add a number to be tagged." : "Saved", needsNumber ? "info" : "success");
      router.refresh();
    } else {
      const text = res.status === 400 ? (res.data.issues?.[0]?.message ?? "Please check your details.") : "Couldn't save. Please try again.";
      setStatus({ kind: "error", text });
      toast(text, "error");
    }
  }

  async function sendTest() {
    setStatus({ kind: "saving" });
    const res = await postJson<{ error?: string }>("/api/ec/test", {});
    const text = res.ok
      ? "Test sent. Check the WhatsApp group: it should tag you."
      : res.data.error === "no_number"
        ? "Save your WhatsApp number first."
        : res.status === 429
          ? "That's enough tests for now. Try again in a few minutes."
          : "The bot couldn't send it. Try again in a minute.";
    setStatus(res.ok ? { kind: "ok", text } : { kind: "error", text });
    toast(res.ok ? "Test message sent" : text, res.ok ? "success" : "error");
  }

  return (
    <Section title="Get tagged" description="When a group reminder goes out and your day isn't complete, the bot tags you in the WhatsApp group. Add your number so it can.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Your WhatsApp number" type="tel" inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={24} placeholder="919876543210" hint="With country code. Needed so the bot can tag you. Only you and the owner can see it." autoComplete="tel" />
        <Toggle label="Tag me in reminders" checked={enabled} onChange={setEnabled} onText="On" offText="Off" />
        {status.kind === "ok" && <FormMessage kind="success">{status.text}</FormMessage>}
        {status.kind === "error" && <FormMessage kind="error">{status.text}</FormMessage>}
        <GlassButton type="submit" disabled={status.kind === "saving"} className="w-full">{status.kind === "saving" ? "Working…" : "Save"}</GlassButton>
        <button type="button" onClick={sendTest} disabled={status.kind === "saving"} className="glass-focus self-center rounded-full px-3 py-1 text-sm font-medium text-accent-strong hover:underline">Send me a test message</button>
      </form>
    </Section>
  );
}
