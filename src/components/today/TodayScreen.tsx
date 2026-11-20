"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GlassButton, GlassCard, ProgressRing } from "@/components/ui";
import type { TrackerPayload } from "@/server/tracker/respond";
import { evaluateDay, type TaskKey, type TrackerConfig } from "@/server/tracker/rules";
import type { DayPatch } from "@/server/tracker/schema";
import { Celebration } from "./Celebration";
import { useConfetti } from "./Confetti";
import { Chip, NumberField, TextField, Toggle } from "./controls";
import { TaskCard } from "./TaskCard";
import { useDaySaver } from "./useDaySaver";

type Values = {
  runKm: number; warmupPreDone: boolean; warmupPostDone: boolean; stretchMin: number; waterL: number; electrolytesDone: boolean;
  proteinG: number; studyMin: number; studyTopic: string; techNote: string; githubContribution: boolean; readingMin: number;
  readingTitle: string; updateText: string; privateNotes: string;
};

const fromLog = (log: TrackerPayload["log"]): Values => ({
  runKm: log?.runKm ?? 0, warmupPreDone: log?.warmupPreDone ?? false, warmupPostDone: log?.warmupPostDone ?? false,
  stretchMin: log?.stretchMin ?? 0, waterL: log?.waterL ?? 0, electrolytesDone: log?.electrolytesDone ?? false,
  proteinG: log?.proteinG ?? 0, studyMin: log?.studyMin ?? 0, studyTopic: log?.studyTopic ?? "", techNote: log?.techNote ?? "",
  githubContribution: log?.githubContribution ?? false, readingMin: log?.readingMin ?? 0, readingTitle: log?.readingTitle ?? "",
  updateText: log?.updateText ?? "", privateNotes: log?.privateNotes ?? "",
});

const textFields = new Set(["studyTopic", "techNote", "readingTitle", "updateText", "privateNotes"]);

export function TodayScreen({ data, userId }: { data: TrackerPayload; userId: string }) {
  const [values, setValues] = useState<Values>(() => fromLog(data.log));
  const { status, message, save, retry } = useDaySaver(userId, data.date);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    // empty text is stored as null
    save({ [key]: textFields.has(key) && typeof value === "string" && value.trim() === "" ? null : value } as DayPatch);
  }

  // Same pure rules as the server, for instant feedback. The protein target arrives already computed.
  const config: TrackerConfig = useMemo(
    () => ({ runTargetKm: data.targets.runKm, waterTargetL: data.targets.waterL, studyMinTarget: data.targets.studyMin, weightKg: data.proteinTargetG, proteinMultiplier: 1 }),
    [data.targets, data.proteinTargetG],
  );
  const result = evaluateDay({ ...values, techNote: values.techNote }, { date: data.date, dayOver: false, config });
  const required = new Set<TaskKey>(result.required);
  const done = (k: TaskKey) => !result.pending.includes(k);
  const sunday = data.isSunday;
  const pct = (result.doneCount / result.requiredCount) * 100;

  // Celebrate a task the moment it flips to done (not on first load), and the whole day when it completes.
  const { fire, layer } = useConfetti();
  const doneKey = result.done.join(",");
  const previous = useRef<{ done: string; completed: boolean } | null>(null);
  useEffect(() => {
    const was = previous.current;
    previous.current = { done: doneKey, completed: result.completed };
    if (!was) return;
    if (!was.completed && result.completed) return void fire("day");
    const before = new Set(was.done.split(","));
    if (doneKey.split(",").some((k) => k && !before.has(k))) {
      // burst from the card being worked on (the focused control sits inside it), else near the top
      const card = (document.activeElement as HTMLElement | null)?.closest("[role=group][data-done]");
      const r = card?.getBoundingClientRect();
      fire("task", r ? { x: r.left + 30, y: r.top + 28 } : undefined);
    }
  }, [doneKey, result.completed, fire]);

  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${data.date}T00:00:00Z`));

  return (
    <div className="flex flex-col gap-4">
      {layer}
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-muted">{dateLabel}</p>
          <h1 className="text-3xl font-semibold tracking-tight">Day {data.dayNumber ?? "–"}<span className="text-lg font-medium text-ink-muted"> of {data.totalDays}</span></h1>
          {sunday && <p className="mt-1 inline-block rounded-full bg-white/70 px-3 py-0.5 text-sm font-medium text-accent-strong">Sunday: recovery day</p>}
        </div>
        <ProgressRing value={pct} size={96} label={`${result.doneCount} of ${result.requiredCount} tasks done`}>
          <span className="text-lg">{result.doneCount}/{result.requiredCount}</span>
        </ProgressRing>
      </header>

      {data.finalDay && data.summary && <Celebration summary={data.summary} />}

      {result.completed && (
        <GlassCard role="status" className="bg-emerald-50/80 p-4 text-center font-semibold text-success">All tasks done. Day complete.</GlassCard>
      )}

      {required.has("RUN") && (
        <TaskCard title="Run" done={done("RUN")} tag={`${data.targets.runKm} km`}>
          <NumberField label="Distance" value={values.runKm} onChange={(n) => set("runKm", n)} unit="km" step={0.1} max={100} />
          <div className="flex gap-2"><Chip onClick={() => set("runKm", data.targets.runKm)}>Log {data.targets.runKm} km</Chip></div>
        </TaskCard>
      )}
      {required.has("WARM_PRE") && (
        <TaskCard title="Warm-up before the run" done={done("WARM_PRE")} tag="10+ min">
          <Toggle label="Warm-up" checked={values.warmupPreDone} onChange={(b) => set("warmupPreDone", b)} />
        </TaskCard>
      )}
      {required.has("WARM_POST") && (
        <TaskCard title="Cool-down after the run" done={done("WARM_POST")} tag="10+ min">
          <Toggle label="Cool-down" checked={values.warmupPostDone} onChange={(b) => set("warmupPostDone", b)} />
        </TaskCard>
      )}
      <TaskCard title="Stretching" done={values.stretchMin >= 20} tag={sunday ? "Required today" : "Optional"}>
        <NumberField label="Stretching" value={values.stretchMin} onChange={(n) => set("stretchMin", n)} unit="min" max={300} hint="20 to 30 minutes." />
        <div className="flex gap-2"><Chip onClick={() => set("stretchMin", 25)}>Log 25 min</Chip></div>
      </TaskCard>
      <TaskCard title="Water" done={done("WATER")} tag={`${data.targets.waterL} L`}>
        <NumberField label="Water" value={values.waterL} onChange={(n) => set("waterL", n)} unit="L" step={0.25} max={20} />
        <div className="flex gap-2"><Chip onClick={() => set("waterL", Math.round((values.waterL + 0.5) * 100) / 100)}>+ 0.5 L</Chip></div>
      </TaskCard>
      <TaskCard title="Electrolytes" done={done("ELECTRO")}>
        <Toggle label="Electrolytes / salts taken" checked={values.electrolytesDone} onChange={(b) => set("electrolytesDone", b)} />
      </TaskCard>
      <TaskCard title="Protein" done={done("PROTEIN")} tag={data.proteinTargetG ? `${data.proteinTargetG} g` : undefined}>
        <NumberField
          label="Protein"
          value={values.proteinG}
          onChange={(n) => set("proteinG", Math.round(n))}
          unit="g"
          max={1000}
          hint={data.proteinTargetG ? `Your target is ${data.proteinTargetG} g (from your weight).` : "Add your weight in Settings to get a protein target."}
        />
      </TaskCard>
      <TaskCard title="Study" done={done("STUDY")} tag={`${data.targets.studyMin}+ min`}>
        <NumberField label="Study time" value={values.studyMin} onChange={(n) => set("studyMin", Math.round(n))} unit="min" max={600} />
        <TextField label="Topic" value={values.studyTopic} onChange={(s) => set("studyTopic", s)} max={200} placeholder="What did you study?" />
      </TaskCard>
      <TaskCard title="Tech note" done={done("TECH")}>
        <TextField label="One useful, implementable tip" value={values.techNote} onChange={(s) => set("techNote", s)} max={1000} multiline />
      </TaskCard>
      <TaskCard title="GitHub contribution" done={done("GITHUB")}>
        <Toggle label="Committed or opened a PR on my project" checked={values.githubContribution} onChange={(b) => set("githubContribution", b)} />
      </TaskCard>
      <TaskCard title="Satsang or reading" done={done("SATSANG")}>
        <NumberField label="Time" value={values.readingMin} onChange={(n) => set("readingMin", Math.round(n))} unit="min" max={600} />
        <TextField label="Title" value={values.readingTitle} onChange={(s) => set("readingTitle", s)} max={200} placeholder="Satsang, podcast, article or book" />
      </TaskCard>

      <GlassCard className="flex flex-col gap-3 p-4">
        <h2 className="text-base font-semibold">Notes</h2>
        <TextField label="Update for the circle" value={values.updateText} onChange={(s) => set("updateText", s)} max={280} hint="Public: everyone in the circle sees this line." />
        <TextField label="Private note" value={values.privateNotes} onChange={(s) => set("privateNotes", s)} max={2000} multiline hint="Visible to you and the circle owner only." />
      </GlassCard>

      <div aria-live="polite" className="min-h-10 text-center text-sm text-ink-muted">
        {status === "saving" && "Saving…"}
        {status === "saved" && "Saved"}
        {status === "error" && (
          <span className="inline-flex items-center gap-2 text-danger">
            {message}
            <GlassButton variant="ghost" onClick={() => void retry()} className="min-h-9 px-3 text-sm">Retry</GlassButton>
          </span>
        )}
      </div>
    </div>
  );
}
