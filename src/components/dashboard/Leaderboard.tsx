"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { MiniStrip } from "@/components/progress/MiniStrip";
import { GlassCard } from "@/components/ui";
import type { OverviewRow } from "@/server/dashboard/analytics";

const medal = ["🥇", "🥈", "🥉"];

/** Last 7 days, ranked. Tap a row to open that member's quick picture. */
export function Leaderboard({ rows, meId }: { rows: OverviewRow[]; meId: string }) {
  const reduce = useReducedMotion();
  const ranked = [...rows].sort((a, b) => b.last7.pct - a.last7.pct || b.streak - a.streak || a.displayName.localeCompare(b.displayName));
  const [open, setOpen] = useState<string | null>(ranked.find((r) => r.id === meId)?.id ?? ranked[0]?.id ?? null);

  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <p className="text-sm text-ink-muted">Average share of tasks done over the last 7 days. Tap a name.</p>
      </div>
      <ul aria-label="Leaderboard" className="flex flex-col gap-1.5">
        {ranked.map((r, i) => {
          const isOpen = open === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.id)}
                className="glass-focus hover-tint flex w-full flex-col gap-1.5 rounded-2xl px-3 py-2.5 text-left"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">
                    <span aria-hidden="true" className="mr-2 inline-block w-6 text-center text-sm">{medal[i] ?? i + 1}</span>
                    {r.displayName}
                    {r.id === meId && <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-accent-strong">You</span>}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">{r.last7.pct}%</span>
                </span>
                <span className="h-2.5 overflow-hidden rounded-full bg-accent/15" aria-hidden="true">
                  <motion.span
                    className="block h-full rounded-full bg-gradient-to-r from-accent to-violet-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(r.last7.pct, 2)}%` }}
                    transition={reduce ? { duration: 0 } : { duration: 0.8, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  />
                </span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={reduce ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="mx-1 mt-1 flex flex-col gap-3 rounded-2xl bg-white/50 p-3">
                      <dl className="grid grid-cols-3 gap-2 text-center">
                        {[
                          { l: "Streak", v: `${r.streak}` },
                          { l: "Overall", v: `${r.window.pct}%` },
                          { l: "Tasks ticked", v: `${r.tasksPct}%` },
                        ].map((s) => (
                          <div key={s.l}>
                            <dd className="text-xl font-semibold">{s.v}</dd>
                            <dt className="text-xs text-ink-muted">{s.l}</dt>
                          </div>
                        ))}
                      </dl>
                      <MiniStrip states={r.recent} />
                      <Link href={`/progress/${r.id}`} className="glass-focus w-fit rounded-full text-sm font-medium text-accent-strong underline-offset-4 hover:underline">See details</Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
