"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/auth/fields";
import { GlassButton } from "@/components/ui";
import { patchJson } from "@/lib/api";
import { Section, type Status } from "./Section";

type Body = { weightKg: number | null; heightCm: number | null; proteinMultiplier: number; waterTargetL: number; runTargetKm: number; studyMinTarget: number; proteinTargetG: number | null };

function Num({ label, value, onChange, min, max, step, unit, hint }: { label: string; value: string; onChange: (s: string) => void; min: number; max: number; step: number; unit: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="glass glass-focus min-h-12 w-full rounded-2xl px-4 text-base text-ink"
        />
        <span className="w-10 shrink-0 text-sm text-ink-muted">{unit}</span>
      </div>
      {hint && <p id={`${id}-hint`} className="text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

const toNum = (s: string) => (s.trim() === "" ? null : Number(s));

export function BodyLimitsForm({ body }: { body: Body }) {
  const router = useRouter();
  const [f, setF] = useState({
    weightKg: body.weightKg?.toString() ?? "",
    heightCm: body.heightCm?.toString() ?? "",
    proteinMultiplier: String(body.proteinMultiplier),
    waterTargetL: String(body.waterTargetL),
    runTargetKm: String(body.runTargetKm),
    studyMinTarget: String(body.studyMinTarget),
  });
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const w = toNum(f.weightKg);
  const m = Number(f.proteinMultiplier);
  const target = w && Number.isFinite(m) ? Math.round(w * m) : null; // same formula as the server

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const res = await patchJson<{ issues?: { message: string }[] }>("/api/body", {
      weightKg: toNum(f.weightKg),
      heightCm: toNum(f.heightCm),
      proteinMultiplier: Number(f.proteinMultiplier),
      waterTargetL: Number(f.waterTargetL),
      runTargetKm: Number(f.runTargetKm),
      studyMinTarget: Number(f.studyMinTarget),
    });
    if (res.ok) {
      setStatus({ kind: "ok", text: "Limits saved." });
      router.refresh();
    } else if (res.status === 400) {
      setStatus({ kind: "error", text: res.data.issues?.[0]?.message ?? "Please check the values." });
    } else {
      setStatus({ kind: "error", text: "Couldn't save. Please try again." });
    }
  }

  return (
    <Section title="Body limits" description="Private: only you and the circle owner can see these. They set your daily targets.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Num label="Weight" value={f.weightKg} onChange={set("weightKg")} min={20} max={400} step={0.1} unit="kg" />
        <Num label="Height" value={f.heightCm} onChange={set("heightCm")} min={80} max={260} step={0.1} unit="cm" />
        <Num label="Protein multiplier" value={f.proteinMultiplier} onChange={set("proteinMultiplier")} min={0.5} max={3} step={0.05} unit="g/kg" />
        <p aria-live="polite" className="glass rounded-2xl px-4 py-3 text-sm font-medium">
          {target ? `Protein target: ${target} g a day` : "Add your weight to get a protein target."}
        </p>
        <Num label="Water target" value={f.waterTargetL} onChange={set("waterTargetL")} min={0.5} max={10} step={0.1} unit="L" />
        <Num label="Run target" value={f.runTargetKm} onChange={set("runTargetKm")} min={0.5} max={50} step={0.1} unit="km" />
        <Num label="Study target" value={f.studyMinTarget} onChange={set("studyMinTarget")} min={60} max={90} step={5} unit="min" hint="Between 60 and 90 minutes." />
        {status.kind === "ok" && <FormMessage kind="success">{status.text}</FormMessage>}
        {status.kind === "error" && <FormMessage kind="error">{status.text}</FormMessage>}
        <GlassButton type="submit" disabled={status.kind === "saving"} className="w-full">{status.kind === "saving" ? "Saving…" : "Save limits"}</GlassButton>
      </form>
    </Section>
  );
}
