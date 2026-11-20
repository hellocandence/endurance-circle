"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GlassButton, GlassCard } from "@/components/ui";
import { postJson } from "@/lib/api";
import { StartDatePicker } from "./StartDatePicker";

const fmt = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Shown on Today while the 75 Hard is set to begin on a later day. */
export function ScheduledStart({ startDate, daysUntil }: { startDate: string; daysUntil: number }) {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [date, setDate] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function restart(startDate?: string) {
    setBusy(true);
    setError(false);
    const res = await postJson("/api/tracker/restart", startDate ? { startDate } : {});
    if (res.ok) router.refresh();
    else {
      setBusy(false);
      setError(true);
    }
  }

  return (
    <GlassCard className="flex flex-col gap-4 p-6">
      <div className="text-center">
        <p aria-hidden="true" className="text-4xl">🗓️</p>
        <h1 className="mt-2 text-2xl font-semibold">Your 75 Hard starts {fmt(startDate)}</h1>
        <p className="text-ink-muted">{daysUntil === 1 ? "That is tomorrow." : `That is in ${daysUntil} days.`} Day 1 begins at midnight your time. Until then you can look around the app.</p>
      </div>
      {changing ? (
        <>
          <StartDatePicker onChange={setDate} />
          <div className="flex gap-2">
            <GlassButton onClick={() => void restart(date)} disabled={busy} className="flex-1">{busy ? "Saving…" : "Save start date"}</GlassButton>
            <GlassButton variant="secondary" onClick={() => setChanging(false)} className="flex-1">Cancel</GlassButton>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <GlassButton onClick={() => void restart()} disabled={busy} className="w-full">{busy ? "Starting…" : "Start today instead"}</GlassButton>
          <GlassButton variant="secondary" onClick={() => setChanging(true)} className="w-full">Change start date</GlassButton>
        </div>
      )}
      {error && <p role="alert" className="text-center text-sm font-medium text-danger">Couldn&apos;t save. Please try again.</p>}
    </GlassCard>
  );
}
