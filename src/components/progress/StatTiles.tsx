import type { MemberStats } from "@/server/dashboard/analytics";

export function StatTiles({ stats }: { stats: MemberStats }) {
  const tiles = [
    { label: "Completion", value: `${stats.completionPct}%`, hint: `${stats.completedDays} of ${stats.elapsedDays} days` },
    { label: "Current streak", value: `${stats.streak}`, hint: stats.streak === 1 ? "perfect day in a row" : "perfect days in a row" },
    { label: "Longest streak", value: `${stats.longestRun}`, hint: stats.longestRun === 1 ? "day" : "days" },
    { label: "Tasks ticked", value: `${stats.avgTaskPct}%`, hint: stats.bestWeek ? `best week: W${stats.bestWeek}` : "of required tasks" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="glass rounded-2xl p-3">
          <dt className="text-sm text-ink-muted">{t.label}</dt>
          <dd className="text-2xl font-semibold tracking-tight">{t.value}</dd>
          <dd className="text-xs text-ink-muted">{t.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
