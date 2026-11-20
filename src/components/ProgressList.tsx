"use client";

import Link from "next/link";
import { Bar } from "@/components/progress/Bar";
import { MiniStrip } from "@/components/progress/MiniStrip";
import { GlassCard } from "@/components/ui";
import type { OverviewRow } from "@/server/dashboard/analytics";

export function ProgressList({ rows, meId }: { rows: OverviewRow[]; meId: string }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Progress by member">
      {rows.map((r) => (
        <li key={r.id}>
          <GlassCard role="group" aria-label={r.displayName} className="flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">
                <Link href={`/progress/${r.id}`} className="glass-focus rounded-md underline-offset-4 hover:underline">{r.displayName}</Link>
                {r.id === meId && <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-accent-strong">You</span>}
              </h2>
              <span className="text-sm text-ink-muted">{r.dayNumber ? `Day ${r.dayNumber}` : "Not started"}</span>
            </div>
            <Bar label="Overall" value={r.window.pct} detail={`${r.window.completed} of ${r.window.elapsed} days`} />
            <Bar label="Last 7 days" value={r.last7.pct} detail={`${r.last7.completed} of ${r.last7.elapsed} days`} />
            <MiniStrip states={r.recent} />
            <div className="flex items-center justify-between text-sm text-ink-muted">
              <span>{r.streak} {r.streak === 1 ? "day" : "days"} streak</span>
              <Link href={`/progress/${r.id}`} className="glass-focus rounded-full font-medium text-accent-strong underline-offset-4 hover:underline">See details</Link>
            </div>
          </GlassCard>
        </li>
      ))}
    </ul>
  );
}
