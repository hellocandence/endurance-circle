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

type Member = { id: string; name: string | null; email: string; disabled: boolean };
type Scope = "self" | "all" | "user";

/** Everyone sees their status. Only the owner gets the restart controls (the API enforces it again). */
export function ChallengeSection({ programme, members }: { programme: ProgrammeInfo | null; members: Member[] | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("self");
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const active = (members ?? []).filter((m) => !m.disabled);

  async function restart() {
    setBusy(true);
    setMessage(null);
    const body = { scope, ...(scope === "user" ? { userId } : {}), ...(date ? { startDate: date } : {}) };
    const res = await postJson<{ restarted?: number; startDate?: string }>("/api/admin/challenge/restart", body);
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setMessage({ kind: "success", text: `Restarted ${res.data.restarted ?? 0} challenge${res.data.restarted === 1 ? "" : "s"}. Day 1 is ${res.data.startDate ? fmt(res.data.startDate) : "today"}.` });
      router.refresh();
    } else setMessage({ kind: "error", text: "Couldn't restart. Please try again." });
  }

  const status = !programme
    ? "You haven't started yet. Begin from the Today tab."
    : programme.started
      ? `Day ${programme.dayNumber} of ${programme.totalDays}. Started ${fmt(programme.startDate)}.`
      : `Starts ${fmt(programme.startDate)} (${programme.daysUntilStart === 1 ? "tomorrow" : `in ${programme.daysUntilStart} days`}).`;

  const options: { id: Scope; title: string }[] = [
    { id: "self", title: "My own challenge" },
    { id: "all", title: "Everyone's challenge" },
    { id: "user", title: "One member's challenge" },
  ];

  return (
    <Section title="Challenge" description="Your 75 Hard.">
      <p className="text-sm">{status}</p>
      {members && !open && <GlassButton variant="secondary" onClick={() => setOpen(true)} className="w-full">Restart challenge (owner)</GlassButton>}
      {members && open && (
        <div role="group" aria-label="Restart challenge" className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">Begins a fresh 75 Hard from the day you choose. Current progress is hidden, kept safely and not deleted. Only the people you pick are affected.</p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Who should restart?</legend>
            {options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm">
                <input type="radio" name="restart-scope" checked={scope === o.id} onChange={() => setScope(o.id)} />
                {o.title}
              </label>
            ))}
          </fieldset>
          {scope === "user" && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Member
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className="glass glass-focus rounded-xl p-2 font-normal">
                <option value="">Choose a member…</option>
                {active.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
              </select>
            </label>
          )}
          {scope === "all" && <p role="note" className="text-sm font-medium text-danger">This restarts the challenge for all {active.length} members, including you.</p>}
          <StartDatePicker onChange={setDate} />
          <div className="flex gap-2">
            <GlassButton onClick={() => void restart()} disabled={busy || (scope === "user" && !userId)} className="flex-1">{busy ? "Restarting…" : "Yes, restart"}</GlassButton>
            <GlassButton variant="secondary" onClick={() => setOpen(false)} className="flex-1">Cancel</GlassButton>
          </div>
        </div>
      )}
      <div aria-live="polite">{message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}</div>
    </Section>
  );
}
