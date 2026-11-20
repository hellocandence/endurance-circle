"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GlassButton, GlassCard } from "@/components/ui";
import { postJson } from "@/lib/api";
import { StartDatePicker } from "./StartDatePicker";

export function StartProgram() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [startDate, setStartDate] = useState<string | undefined>(undefined);

  async function start() {
    setBusy(true);
    setError(false);
    const res = await postJson("/api/tracker/start", startDate ? { startDate } : {});
    if (res.ok) router.refresh();
    else {
      setBusy(false);
      setError(true);
    }
  }

  return (
    <GlassCard className="flex flex-col gap-4 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Ready to begin?</h1>
        <p className="text-ink-muted">Your 75 Hard counts 75 days from Day 1, and the count never resets.</p>
      </div>
      <StartDatePicker onChange={setStartDate} />
      {error && <p role="alert" className="text-center text-sm font-medium text-danger">Couldn&apos;t start. Please try again.</p>}
      <GlassButton onClick={start} disabled={busy} className="w-full">{busy ? "Starting…" : startDate ? "Schedule my 75 Hard" : "Start my 75 Hard"}</GlassButton>
    </GlassCard>
  );
}
