"use client";

import { GlassCard, ProgressRing } from "@/components/ui";
import type { CirclePulse } from "@/server/dashboard/public";

export function PulseCard({ pulse }: { pulse: CirclePulse }) {
  const pct = pulse.tasksTotal ? (pulse.tasksDone / pulse.tasksTotal) * 100 : 0;
  return (
    <GlassCard className="flex flex-wrap items-center gap-4 p-5" aria-label="Circle pulse">
      <ProgressRing value={pct} size={88} label={`Circle: ${pulse.tasksDone} of ${pulse.tasksTotal} tasks done today`}>
        <span className="text-base">{Math.round(pct)}%</span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold">Circle pulse</h2>
        <p className="text-sm text-ink-muted">
          {pulse.activeToday} of {pulse.memberCount} {pulse.memberCount === 1 ? "member" : "members"} active today
          {pulse.completedToday > 0 && ` · ${pulse.completedToday} finished`}
        </p>
        <p className="text-sm text-ink-muted">Average commitment {pulse.averageCompletionPct}%</p>
      </div>
      {pulse.activity.length > 0 && (
        <div className="w-full basis-full border-t border-white/60 pt-3">
          <h3 className="mb-2 text-sm font-semibold">Who has done what today</h3>
          <ul aria-label="Today's activity" className="flex flex-col gap-2">
            {pulse.activity.map((a) => (
              <li key={a.key} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{a.label}</span>
                  <span className="text-ink-muted">{a.done.length}/{a.total}</span>
                </div>
                <p className="text-ink-muted">{a.done.length ? a.done.map((d) => d.name.split(/\s+/)[0]).join(", ") : "Nobody yet"}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
