import type { WeekBar } from "@/server/dashboard/analytics";

const W = 340;
const H = 150;
const TOP = 16;
const BASE = 118; // y of the baseline
const BAR = 24;
const GAP = (W - 16 - BAR * 11) / 10;

/** Completed days per week, as a share of the days that week has finished (week 11 has only 5 days). */
export function WeekChart({ weeks }: { weeks: WeekBar[] }) {
  const summary = weeks.filter((w) => w.pct !== null).map((w) => `week ${w.week} ${w.pct}%`).join(", ") || "no finished weeks yet";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Completion by week: ${summary}`} className="w-full text-ink">
      <line x1="0" x2={W} y1={BASE} y2={BASE} stroke="currentColor" strokeOpacity="0.2" />
      <line x1="0" x2={W} y1={TOP} y2={TOP} stroke="currentColor" strokeOpacity="0.1" strokeDasharray="3 4" />
      {weeks.map((w, i) => {
        const x = 8 + i * (BAR + GAP);
        const h = w.pct === null ? 0 : Math.max(2, ((BASE - TOP) * w.pct) / 100);
        return (
          <g key={w.week}>
            {w.pct !== null && <rect x={x} y={BASE - h} width={BAR} height={h} rx="5" className="fill-accent" />}
            {w.pct === null && <rect x={x} y={BASE - 3} width={BAR} height={3} rx="1.5" fill="currentColor" fillOpacity="0.15" />}
            {w.pct !== null && (
              <text x={x + BAR / 2} y={BASE - h - 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="currentColor">
                {w.pct}
              </text>
            )}
            <text x={x + BAR / 2} y={BASE + 15} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.75">
              W{w.week}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
