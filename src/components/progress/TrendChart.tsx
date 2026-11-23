"use client";

import { useState } from "react";
import type { TrendPoint } from "@/server/dashboard/analytics";

const W = 340;
const H = 130;
const L = 40;
const R = 8;
const TOP = 10;
const BASE = 100;
const dayLabel = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** Share of the circle that finished each recent day (ends yesterday, so an unfinished day never drags it down). Drag across it, or use the slider, to read each day. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const step = (W - L - R) / Math.max(1, points.length - 1);
  const x = (i: number) => L + i * step;
  const y = (pct: number) => BASE - ((BASE - TOP) * pct) / 100;
  const known = points.map((p, i) => ({ p, i })).filter((q) => q.p.pct !== null);
  const [sel, setSel] = useState(Math.max(0, known.at(-1)?.i ?? points.length - 1));
  const line = known.map((q, k) => `${k === 0 ? "M" : "L"}${x(q.i).toFixed(1)} ${y(q.p.pct as number).toFixed(1)}`).join(" ");
  const area = known.length > 1 ? `${line} L${x(known.at(-1)!.i).toFixed(1)} ${BASE} L${x(known[0].i).toFixed(1)} ${BASE} Z` : "";
  const summary = known.map((q) => `${dayLabel.format(new Date(`${q.p.date}T00:00:00Z`))} ${q.p.pct}%`).join(", ");
  const cur = points[sel];

  function pick(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    setSel(Math.min(points.length - 1, Math.max(0, Math.round((vx - L) / step))));
  }

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Circle completion per day: ${summary || "no data yet"}`} className="w-full touch-pan-y text-ink" onPointerMove={pick} onPointerDown={pick}>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={g === 0 ? 0.25 : 0.1} strokeDasharray={g === 0 ? undefined : "3 4"} />
            <text x={L - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="currentColor" fillOpacity="0.75">{g}%</text>
          </g>
        ))}
        {area && <path d={area} className="fill-accent" fillOpacity="0.15" />}
        {line && <path d={line} fill="none" className="stroke-accent" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {cur && <line x1={x(sel)} x2={x(sel)} y1={TOP} y2={BASE} className="stroke-accent" strokeOpacity="0.35" strokeDasharray="3 3" />}
        {known.map((q) => (
          <circle key={q.p.date} cx={x(q.i)} cy={y(q.p.pct as number)} r={q.i === sel ? 5.5 : 3} className="fill-accent" style={{ transition: "r 150ms" }} />
        ))}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1]
          .filter((i, k, a) => i >= 0 && a.indexOf(i) === k && points[i])
          .map((i) => (
            <text key={i} x={x(i)} y={BASE + 16} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="9" fill="currentColor" fillOpacity="0.75">
              {dayLabel.format(new Date(`${points[i].date}T00:00:00Z`))}
            </text>
          ))}
      </svg>
      {cur && points.length > 1 && (
        <>
          <p aria-live="polite" className="text-sm">
            <span className="font-medium">{dayLabel.format(new Date(`${cur.date}T00:00:00Z`))}</span>
            <span className="text-ink-muted">: {cur.pct === null ? "nobody enrolled yet" : `${cur.pct}% (${cur.completed} of ${cur.enrolled} finished)`}</span>
          </p>
          <input type="range" min={0} max={points.length - 1} value={sel} onChange={(e) => setSel(Number(e.target.value))} aria-label="Pick a day" className="glass-focus w-full rounded-full accent-[var(--color-accent)]" />
        </>
      )}
    </div>
  );
}
