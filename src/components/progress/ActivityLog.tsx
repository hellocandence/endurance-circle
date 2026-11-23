import { GlassCard } from "@/components/ui";
import type { ActivityDay } from "@/server/dashboard/analytics";

const dateFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const badge = { done: "bg-emerald-100 text-emerald-900", today: "bg-indigo-100 text-indigo-900", missed: "bg-rose-100 text-rose-900", future: "" } as const;
const word = { done: "Complete", today: "In progress", missed: "Incomplete", future: "" } as const;

/** The last two weeks, newest first: what was ticked each day and the public update line. Public data only. */
export function ActivityLog({ days }: { days: ActivityDay[] }) {
  if (days.length === 0) return null;
  return (
    <GlassCard role="region" aria-label="Activity log" className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="font-semibold">Activity log</h2>
        <p className="text-sm text-ink-muted">Task by task for the last {days.length} days.</p>
      </div>
      <ol className="flex flex-col gap-3">
        {days.map((d) => (
          <li key={d.date} className="rounded-2xl bg-white/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">
                Day {d.dayNumber} <span className="font-normal text-ink-muted">· {dateFmt.format(new Date(`${d.date}T00:00:00Z`))}</span>
              </p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[d.state]}`}>
                {d.done}/{d.required} · {word[d.state]}
              </span>
            </div>
            <ul aria-label={`Tasks on day ${d.dayNumber}`} className="mt-2 flex flex-wrap gap-1.5">
              {d.tasks.map((t) => (
                <li key={t.key} className={`rounded-full px-2.5 py-1 text-xs font-medium ${t.done ? "bg-accent text-white" : "border border-ink-muted/30 text-ink-muted"}`}>
                  <span aria-hidden="true">{t.done ? "✓ " : ""}</span>
                  {t.label}
                  <span className="sr-only">{t.done ? " done" : " not done"}</span>
                </li>
              ))}
            </ul>
            {d.updateText && <p className="mt-2 text-sm">“{d.updateText}”</p>}
          </li>
        ))}
      </ol>
    </GlassCard>
  );
}
