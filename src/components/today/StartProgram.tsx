"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GlassButton, GlassCard } from "@/components/ui";
import { postJson } from "@/lib/api";

export function StartProgram() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function start() {
    setBusy(true);
    setError(false);
    const res = await postJson("/api/tracker/start", {});
    if (res.ok) router.refresh();
    else {
      setBusy(false);
      setError(true);
    }
  }

  return (
    <GlassCard className="flex flex-col items-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Ready to begin?</h1>
      <p className="text-ink-muted">Start your 75 Hard today. Day 1 begins now, and the count never resets.</p>
      {error && <p role="alert" className="text-sm font-medium text-danger">Couldn&apos;t start. Please try again.</p>}
      <GlassButton onClick={start} disabled={busy} className="w-full">{busy ? "Starting…" : "Start my 75 Hard"}</GlassButton>
    </GlassCard>
  );
}
