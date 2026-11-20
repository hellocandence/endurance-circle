import type { TrendPoint } from "@/server/dashboard/analytics";

const W = 340;
const H = 130;
const L = 40;
const R = 8;
const TOP = 10;
const BASE = 100;
const dayLabel = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** Share of the circle that finished each recent day (ends yesterday, so an unfinished day never drags it down). */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const step = (W - L - R) / Math.max(1, points.length - 1);
  const x = (i: number) => L + i * step;
  const y = (pct: number) => BASE - ((BASE - TOP) * pct) / 100;
  const known = points.map((p, i) => ({ p, i })).filter((q) => q.p.pct !== null);
  const line = known.map((q, k) => `${k === 0 ? "M" : "L"}${x(q.i).toFixed(1)} ${y(q.p.pct as number).toFixed(1)}`).join(" ");
  const area = known.length > 1 ? `${line} L${x(known.at(-1)!.i).toFixed(1)} ${BASE} L${x(known[0].i).toFixed(1)} ${BASE} Z` : "";
  const summary = known.map((q) => `${dayLabel.format(new Date(`${q.p.date}T00:00:00Z`))} ${q.p.pct}%`).join(", ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Circle completion per day: ${summary || "no data yet"}`} className="w-full text-ink">
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={g === 0 ? 0.25 : 0.1} strokeDasharray={g === 0 ? undefined : "3 4"} />
          <text x={L - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity="0.75">{g}%</text>
        </g>
      ))}
      {area && <path d={area} className="fill-accent" fillOpacity="0.15" />}
      {line && <path d={line} fill="none" className="stroke-accent" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {known.map((q) => (
        <circle key={q.p.date} cx={x(q.i)} cy={y(q.p.pct as number)} r="3" className="fill-accent" />
      ))}
      {[0, Math.floor((points.length - 1) / 2), points.length - 1]
        .filter((i, k, a) => i >= 0 && a.indexOf(i) === k && points[i])
        .map((i) => (
          <text key={i} x={x(i)} y={BASE + 16} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="9" fill="currentColor" fillOpacity="0.75">
            {dayLabel.format(new Date(`${points[i].date}T00:00:00Z`))}
          </text>
        ))}
    </svg>
  );
}
