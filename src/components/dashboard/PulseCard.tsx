"use client";

import { GlassCard, ProgressRing } from "@/components/ui";
import type { CirclePulse } from "@/server/dashboard/public";

export function PulseCard({ pulse }: { pulse: CirclePulse }) {
  const pct = pulse.tasksTotal ? (pulse.tasksDone / pulse.tasksTotal) * 100 : 0;
  return (
    <GlassCard className="flex items-center gap-4 p-5" aria-label="Circle pulse">
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
    </GlassCard>
  );
}
