"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/fields";
import { Toggle } from "@/components/today/controls";
import { GlassButton, useToast } from "@/components/ui";
import { sendJson } from "@/lib/api";
import { DEFAULT_TIMES, EARLIEST, LATEST, MAX_TIMES } from "@/lib/ec-times";
import type { GroupSettings } from "@/server/ec/service";
import { Section, type Status } from "@/components/settings/Section";

const select = "glass glass-focus min-h-12 w-full min-w-0 rounded-2xl px-3 text-base text-ink";

export function EcGroupCard({ group, isOwner }: { group: GroupSettings; isOwner: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = useState(group.enabled);
  const [times, setTimes] = useState<string[]>(group.times);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  if (!isOwner) {
    return (
      <Section title="Group reminders" description="Sent to the circle's WhatsApp group by the owner. If your day isn't complete, the bot tags you.">
        <p className="text-base">{group.enabled ? `Every day at ${group.times.join(", ")}.` : "Currently off."}</p>
      </Section>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const res = await sendJson<{ issues?: { message: string }[] }>("PUT", "/api/ec/group", { enabled, times });
    if (res.ok) {
      setStatus({ kind: "ok", text: "Group reminders saved." });
      toast("Group reminders saved", "success");
      router.refresh();
    } else {
      const text = res.status === 400 ? (res.data.issues?.[0]?.message ?? "Check the times.") : "Couldn't save. Please try again.";
      setStatus({ kind: "error", text });
      toast(text, "error");
    }
  }

  return (
    <Section title="Group reminders" description="At each time the bot checks everyone's day in the WhatsApp group. If nobody has finished it tags everyone, if some have it tags only those still to finish, and if all are done it stays quiet.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Toggle label="Daily group reminders" checked={enabled} onChange={setEnabled} onText="On" offText="Off" />
        <p className="text-sm text-ink-muted">The app sleeps from 11:59 PM to 6:00 AM, so pick times between 6:00 AM and 11:45 PM. A reminder can arrive up to 15 minutes late.</p>
        <label className="flex flex-col gap-1 text-sm font-medium">How many reminders a day?
          <select className={select} value={times.length} onChange={(e) => setTimes(DEFAULT_TIMES[Number(e.target.value)])}>
            {Array.from({ length: MAX_TIMES }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-3">
          {times.map((t, i) => (
            <label key={i} className="flex flex-col gap-1 text-sm font-medium">Reminder {i + 1} (your time zone)
              <input type="time" className={select} value={t} min={EARLIEST} max={LATEST} onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} required />
            </label>
          ))}
        </div>
        {group.lastSentAt && <p className="text-sm text-ink-muted">Last sent {new Date(group.lastSentAt).toLocaleString()}.</p>}
        {status.kind === "ok" && <FormMessage kind="success">{status.text}</FormMessage>}
        {status.kind === "error" && <FormMessage kind="error">{status.text}</FormMessage>}
        <GlassButton type="submit" disabled={status.kind === "saving"} className="w-full">{status.kind === "saving" ? "Saving…" : "Save group reminders"}</GlassButton>
      </form>
    </Section>
  );
}
