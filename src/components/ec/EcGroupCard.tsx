"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormMessage } from "@/components/auth/fields";
import { Toggle } from "@/components/today/controls";
import { GlassButton } from "@/components/ui";
import { sendJson } from "@/lib/api";
import { EARLIEST, LATEST } from "@/lib/ec-times";
import type { GroupSettings } from "@/server/ec/service";
import { Section, type Status } from "@/components/settings/Section";

export function EcGroupCard({ group, isOwner }: { group: GroupSettings; isOwner: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(group.enabled);
  const [time, setTime] = useState(group.time);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  if (!isOwner) {
    return (
      <Section title="Group reminder" description="Sent to the circle's WhatsApp group by the owner. It doesn't tag anyone.">
        <p className="text-base">{group.enabled ? `Every day at ${group.time}.` : "Currently off."}</p>
      </Section>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const res = await sendJson<{ issues?: { message: string }[] }>("PUT", "/api/ec/group", { enabled, time });
    if (res.ok) {
      setStatus({ kind: "ok", text: "Group reminder saved." });
      router.refresh();
    } else setStatus({ kind: "error", text: res.status === 400 ? (res.data.issues?.[0]?.message ?? "Check the time.") : "Couldn't save. Please try again." });
  }

  return (
    <Section title="Group reminder" description="One message a day to the circle's WhatsApp group, asking everyone to update their log. It doesn't tag anyone.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Toggle label="Daily group reminder" checked={enabled} onChange={setEnabled} />
        <Field label="Time (your time zone)" type="time" value={time} min={EARLIEST} max={LATEST} onChange={(e) => setTime(e.target.value)} required />
        {group.lastSentAt && <p className="text-sm text-ink-muted">Last sent {new Date(group.lastSentAt).toLocaleString()}.</p>}
        {status.kind === "ok" && <FormMessage kind="success">{status.text}</FormMessage>}
        {status.kind === "error" && <FormMessage kind="error">{status.text}</FormMessage>}
        <GlassButton type="submit" disabled={status.kind === "saving"} className="w-full">{status.kind === "saving" ? "Saving…" : "Save group reminder"}</GlassButton>
      </form>
    </Section>
  );
}
