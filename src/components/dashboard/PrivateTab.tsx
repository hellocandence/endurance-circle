"use client";

import { GlassCard } from "@/components/ui";

export type MyJourney = {
  programme: { startDate: string; totalDays: number; dayNumber: number | null } | null;
  stats: { window: { completed: number; elapsed: number; pct: number }; last7: { pct: number; completed: number; elapsed: number }; perfectDaysInARow: number; longestRun: number } | null;
  logs: { logDate: string; dayNumber: number; completed: boolean; missedTasks: string[]; updateText: string | null; privateNotes: string | null }[];
};

const fmt = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export function PrivateTab({ journey }: { journey: MyJourney }) {
  if (!journey.programme || !journey.stats) {
    return <GlassCard className="p-5 text-center text-ink-muted">Start your 75 Hard on the Today tab to see your journey here.</GlassCard>;
  }
  const { stats, programme } = journey;
  const tiles = [
    ["Day", `${programme.dayNumber ?? "–"} / ${programme.totalDays}`],
    ["Completion", `${stats.window.pct}%`],
    ["Last 7 days", `${stats.last7.pct}%`],
    ["Perfect in a row", String(stats.perfectDaysInARow)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Your own journey. Everyone in the circle can see your daily logs from Progress.</p>
      <dl className="grid grid-cols-2 gap-3">
        {tiles.map(([label, value]) => (
          <GlassCard key={label} className="p-4">
            <dt className="text-xs font-medium text-ink-muted">{label}</dt>
            <dd className="text-2xl font-semibold">{value}</dd>
          </GlassCard>
        ))}
      </dl>
      <h2 className="text-lg font-semibold">Recent days</h2>
      {journey.logs.length === 0 ? (
        <GlassCard className="p-4 text-ink-muted">Nothing logged yet.</GlassCard>
      ) : (
        <ul className="flex flex-col gap-3">
          {journey.logs.map((l) => (
            <li key={l.logDate}>
              <GlassCard className="flex flex-col gap-1 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Day {l.dayNumber} · {fmt(l.logDate)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${l.completed ? "bg-emerald-100 text-success" : l.missedTasks.length ? "bg-amber-100 text-amber-900" : "bg-white/70 text-ink-muted"}`}>
                    {l.completed ? "Complete" : l.missedTasks.length ? `${l.missedTasks.length} missed` : "In progress"}
                  </span>
                </div>
                {l.updateText && <p className="text-sm">{l.updateText}</p>}
                {l.privateNotes && <p className="text-sm text-ink-muted">Note: {l.privateNotes}</p>}
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
