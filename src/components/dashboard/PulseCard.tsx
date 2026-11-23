"use client";

import { motion, useReducedMotion } from "framer-motion";
import { GlassCard, ProgressRing } from "@/components/ui";
import type { CirclePulse } from "@/server/dashboard/public";

const first = (name: string) => name.split(/\s+/)[0];

export function PulseCard({ pulse }: { pulse: CirclePulse }) {
  const reduce = useReducedMotion();
  const pct = pulse.tasksTotal ? (pulse.tasksDone / pulse.tasksTotal) * 100 : 0;
  const stats = [
    { l: "Active today", v: `${pulse.activeToday}/${pulse.memberCount}` },
    { l: "Finished", v: `${pulse.completedToday}` },
    { l: "Avg overall", v: `${pulse.averageCompletionPct}%` },
  ];
  return (
    <GlassCard className="flex flex-col gap-4 p-5" aria-label="Circle pulse">
      <div className="flex items-center gap-4">
        <ProgressRing value={pct} size={112} stroke={12} label={`Circle: ${pulse.tasksDone} of ${pulse.tasksTotal} tasks done today`}>
          <span className="flex flex-col leading-tight">
            <span className="text-2xl">{Math.round(pct)}%</span>
            <span className="text-[11px] font-medium text-ink-muted">{pulse.tasksDone}/{pulse.tasksTotal} tasks</span>
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Circle pulse</h2>
          <p className="text-sm text-ink-muted">Everyone&apos;s tasks today, together.</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.l} className="rounded-xl bg-white/50 px-2 py-2 text-center">
            <dd className="text-lg font-semibold leading-tight">{s.v}</dd>
            <dt className="text-xs leading-tight text-ink-muted">{s.l}</dt>
          </div>
        ))}
      </dl>
      {pulse.activity.length > 0 && (
        <div className="border-t border-white/60 pt-3">
          <h3 className="mb-1 text-sm font-semibold">Who has done what today</h3>
          
          <ul aria-label="Today's activity" className="grid grid-cols-2 gap-x-4 gap-y-3">
            {pulse.activity.map((a, i) => {
              const share = a.total ? (a.done.length / a.total) * 100 : 0;
              return (
                <li key={a.key} className="flex min-w-0 flex-col gap-1 text-sm">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{a.label}</span>
                    <span className="tabular-nums text-ink-muted">{a.done.length}/{a.total}</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-accent/15" aria-hidden="true">
                    <motion.span
                      className="block h-full rounded-full bg-gradient-to-r from-accent to-violet-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${share}%` }}
                      transition={reduce ? { duration: 0 } : { duration: 0.7, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                  <span className="truncate text-xs text-ink-muted">{a.done.length ? a.done.map((d) => first(d.name)).join(", ") : "Nobody yet"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
