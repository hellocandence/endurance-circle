import type { DayCell, DayState } from "@/server/dashboard/analytics";

const fmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const style: Record<DayState, string> = {
  done: "bg-accent",
  missed: "bg-rose-200 border border-rose-400",
  today: "bg-white/80 border-2 border-accent",
  future: "bg-white/40 border border-white/70",
};
const word: Record<DayState, string> = { done: "completed", missed: "missed", today: "in progress", future: "upcoming" };

const LEGEND: { state: DayState; label: string }[] = [
  { state: "done", label: "Done" },
  { state: "missed", label: "Missed" },
  { state: "today", label: "Today" },
  { state: "future", label: "Upcoming" },
];

/** Every programme day as a cell: filled = done, pink = missed, ringed = today, faint = still to come. */
export function Heatmap({ cells }: { cells: DayCell[] }) {
  return (
    <div className="flex flex-col gap-3">
      <ol aria-label="Day by day" className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
        {cells.map((c) => (
          <li
            key={c.n}
            title={`Day ${c.n}, ${fmt.format(new Date(`${c.date}T00:00:00Z`))}: ${word[c.state]}`}
            aria-label={`Day ${c.n}, ${fmt.format(new Date(`${c.date}T00:00:00Z`))}: ${word[c.state]}${c.state === "future" ? "" : `, ${c.done} of ${c.required} tasks`}`}
            className={`aspect-square rounded-[5px] ${style[c.state]}`}
          />
        ))}
      </ol>
      <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {LEGEND.map((l) => (
          <li key={l.state} className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-block size-3 rounded-[4px] ${style[l.state]}`} />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
