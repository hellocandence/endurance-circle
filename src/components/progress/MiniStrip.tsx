import type { DayState } from "@/server/dashboard/analytics";

const tone: Record<DayState, string> = { done: "bg-accent", missed: "bg-rose-300", today: "bg-white/80 border border-accent", future: "bg-white/40" };

/** The most recent days at a glance, oldest first. */
export function MiniStrip({ states }: { states: DayState[] }) {
  if (!states.length) return null;
  const done = states.filter((s) => s === "done").length;
  return (
    <div role="img" aria-label={`Last ${states.length} days: ${done} completed`} className="flex gap-1">
      {states.map((s, i) => (
        <span key={i} aria-hidden className={`h-3 min-w-0 flex-1 rounded-[4px] ${tone[s]}`} />
      ))}
    </div>
  );
}
