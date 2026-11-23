"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui";
import type { DayState, OverviewRow } from "@/server/dashboard/analytics";

const style: Record<DayState, string> = {
  done: "bg-accent",
  missed: "bg-rose-200",
  today: "bg-white/80 ring-2 ring-accent",
  future: "bg-white/40",
};
const word: Record<DayState, string> = { done: "completed", missed: "missed", today: "in progress", future: "upcoming" };
const fmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const first = (name: string) => name.split(/\s+/)[0];
const COLS = 14; // always 14 columns, so a square keeps its size even when only a day or two exist

/** Everyone, day by day for the last two weeks. Tap or hover a square to read it. */
export function CircleHeatmap({ rows }: { rows: OverviewRow[] }) {
  const members = rows.filter((r) => r.recentCells.length > 0);
  const dates = [...new Set(members.flatMap((r) => r.recentCells.map((c) => c.date)))].sort().slice(-COLS);
  const [sel, setSel] = useState<{ name: string; date: string; text: string } | null>(null);
  if (members.length === 0 || dates.length === 0) return null;

  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-lg font-semibold">Day by day</h2>
        <p className="text-sm text-ink-muted">Every member, {dates.length === 1 ? "today" : `last ${dates.length} days`}. Filled = a perfect day.</p>
      </div>
      <div>
        <div role="grid" aria-label="Members by day" className="flex flex-col gap-1">
          {members.map((r) => {
            const byDate = new Map(r.recentCells.map((c) => [c.date, c]));
            return (
              <div key={r.id} role="row" className="flex items-center gap-0.5">
                <span role="rowheader" className="w-14 shrink-0 truncate pr-1 text-xs font-medium">{first(r.displayName)}</span>
                {Array.from({ length: COLS - dates.length }, (_, i) => <span key={`pad-${i}`} aria-hidden="true" className="aspect-square min-w-0 flex-1" />)}
                {dates.map((d) => {
                  const c = byDate.get(d);
                  const state: DayState = c?.state ?? "future";
                  const text = c ? `${c.done} of ${c.required} tasks, ${word[state]}` : "not started";
                  return (
                    <span
                      key={d}
                      role="gridcell"
                      aria-label={`${first(r.displayName)}, ${fmt.format(new Date(`${d}T00:00:00Z`))}: ${text}`}
                      onPointerEnter={() => setSel({ name: r.displayName, date: d, text })}
                      onClick={() => setSel({ name: r.displayName, date: d, text })}
                      className={`aspect-square min-w-0 flex-1 cursor-pointer rounded-[5px] transition-transform hover:scale-125 ${style[state]} ${sel?.name === r.displayName && sel.date === d ? "scale-125 outline outline-2 outline-ink" : ""}`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-ink-muted">
        {sel ? <><span className="font-medium text-ink">{sel.name}</span> · {fmt.format(new Date(`${sel.date}T00:00:00Z`))}: {sel.text}</> : "Tap a square to see that day."}
      </p>
    </GlassCard>
  );
}
