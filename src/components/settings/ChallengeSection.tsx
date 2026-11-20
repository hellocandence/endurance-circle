"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/auth/fields";
import { StartDatePicker } from "@/components/today/StartDatePicker";
import { GlassButton } from "@/components/ui";
import { postJson } from "@/lib/api";
import type { ProgrammeInfo } from "@/server/tracker/service";
import { Section } from "./Section";

const fmt = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export function ChallengeSection({ programme }: { programme: ProgrammeInfo | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function restart() {
    setBusy(true);
    setMessage(null);
    const res = await postJson<{ startDate?: string }>("/api/tracker/restart", date ? { startDate: date } : {});
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setMessage({ kind: "success", text: `Fresh start. Day 1 is ${res.data.startDate ? fmt(res.data.startDate) : "today"}.` });
      router.refresh();
    } else setMessage({ kind: "error", text: "Couldn't restart. Please try again." });
  }

  const status = !programme
    ? "You haven't started yet. Begin from the Today tab."
    : programme.started
      ? `Day ${programme.dayNumber} of ${programme.totalDays}. Started ${fmt(programme.startDate)}.`
      : `Starts ${fmt(programme.startDate)} (${programme.daysUntilStart === 1 ? "tomorrow" : `in ${programme.daysUntilStart} days`}).`;

  return (
    <Section title="Challenge" description="Your 75 Hard.">
      <p className="text-sm">{status}</p>
      {programme && !open && <GlassButton variant="secondary" onClick={() => setOpen(true)} className="w-full">Restart challenge</GlassButton>}
      {programme && open && (
        <div role="group" aria-label="Restart challenge" className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">This begins a fresh 75 Hard from the day you choose. Your current progress is hidden, kept safely and not deleted.</p>
          <StartDatePicker onChange={setDate} />
          <div className="flex gap-2">
            <GlassButton onClick={() => void restart()} disabled={busy} className="flex-1">{busy ? "Restarting…" : "Yes, restart"}</GlassButton>
            <GlassButton variant="secondary" onClick={() => setOpen(false)} className="flex-1">Cancel</GlassButton>
          </div>
        </div>
      )}
      <div aria-live="polite">{message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}</div>
    </Section>
  );
}
