"use client";

import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui";
import type { ProgressRow } from "@/server/dashboard/public";

function Bar({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-ink-muted">{value}% · {detail}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="h-3 overflow-hidden rounded-full bg-accent/15">
        <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
      </div>
    </div>
  );
}

export function ProgressList({ rows, meId }: { rows: ProgressRow[]; meId: string }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Progress by member">
      {rows.map((r) => (
        <li key={r.id}>
          <GlassCard role="group" aria-label={r.displayName} className="flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">
                {r.displayName}
                {r.id === meId && <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-accent-strong">You</span>}
              </h2>
              <span className="text-sm text-ink-muted">{r.dayNumber ? `Day ${r.dayNumber}` : "Not started"}</span>
            </div>
            <Bar label="Overall" value={r.window.pct} detail={`${r.window.completed} of ${r.window.elapsed} days`} />
            <Bar label="Last 7 days" value={r.last7.pct} detail={`${r.last7.completed} of ${r.last7.elapsed} days`} />
          </GlassCard>
        </li>
      ))}
    </ul>
  );
}
