"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GlassButton, GlassCard } from "@/components/ui";
import { postJson } from "@/lib/api";

const fmt = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** The circle-wide fresh start: Day 1 is the same date for everyone, and nothing carries over from before. */
export function CohortStart({ startDate, today }: { startDate: string; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function join() {
    setBusy(true);
    setError(false);
    const res = await postJson("/api/tracker/join", {});
    if (res.ok) router.refresh();
    else {
      setBusy(false);
      setError(true);
    }
  }

  const title = today < startDate ? `A new challenge starts ${fmt(startDate)}` : today === startDate ? "The new challenge starts today" : `The new challenge began ${fmt(startDate)}`;
  const lead = today < startDate ? "Everyone begins together, from zero." : today === startDate ? "Day 1 is today. Everyone begins together, from zero." : "Day 1 was the same day for everyone. Join now to catch up and log from today.";
  return (
    <GlassCard className="flex flex-col gap-4 p-6">
      <div className="text-center">
        <p aria-hidden="true" className="text-4xl">🚀</p>
        <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
        <p className="text-ink-muted">{lead} No progress carries over from the old challenge.</p>
      </div>
      {error && <p role="alert" className="text-center text-sm font-medium text-danger">Couldn&apos;t start. Please try again.</p>}
      <GlassButton onClick={() => void join()} disabled={busy} className="w-full">
        {busy ? "Starting…" : today < startDate ? "Count me in" : today === startDate ? "Start the new challenge" : "Join the new challenge"}
      </GlassButton>
    </GlassCard>
  );
}
