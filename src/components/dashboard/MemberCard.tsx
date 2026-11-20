"use client";

import { motion } from "framer-motion";
import { GlassCard, ProgressRing } from "@/components/ui";
import { TASK_LABELS, type TaskKey } from "@/server/tracker/rules";

export type CardMember = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  todayDone: number;
  todayTotal: number;
  dayNumber: number | null;
  streak: number;
  updateText: string | null;
  commitmentPct: number;
  doneTasks: string[];
  requiredTasks: string[];
  isMe: boolean;
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export function MemberCard({ m, index = 0 }: { m: CardMember; index?: number }) {
  const pct = m.todayTotal ? (m.todayDone / m.todayTotal) * 100 : 0;
  return (
    <li>
      <GlassCard role="group" delay={Math.min(index, 8) * 0.05} className="flex flex-col gap-3 p-4" aria-label={`${m.displayName}${m.isMe ? " (you)" : ""}`}>
        <div className="flex items-center gap-3">
          {m.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- tiny 128 px avatars served by our own API
            <img src={m.avatarUrl} alt="" width={48} height={48} className="size-12 rounded-full object-cover" />
          ) : (
            <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-accent/15 font-semibold text-accent-strong">{initials(m.displayName)}</span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">
              {m.displayName}
              {m.isMe && <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-accent-strong">You</span>}
            </h3>
            <p className="text-sm text-ink-muted">
              {m.dayNumber ? `Day ${m.dayNumber}` : "Not started"}
              {m.streak > 0 && <span> · {m.streak} perfect {m.streak === 1 ? "day" : "days"} in a row</span>}
            </p>
          </div>
          <ProgressRing value={pct} size={56} stroke={6} label={`${m.displayName}: ${m.todayDone} of ${m.todayTotal} tasks today`}>
            <span className="text-xs">{m.todayDone}/{m.todayTotal}</span>
          </ProgressRing>
        </div>
        {m.requiredTasks.length > 0 && (
          <ul aria-label={`${m.displayName}'s tasks today`} className="flex flex-wrap gap-1.5">
            {m.requiredTasks.map((k) => {
              const done = m.doneTasks.includes(k);
              return (
                <li
                  key={k}
                  data-done={done}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${done ? "bg-emerald-100 text-emerald-900" : "bg-white/50 text-ink-muted"}`}
                >
                  <span aria-hidden="true">{done ? "✓ " : ""}</span>
                  {TASK_LABELS[k as TaskKey] ?? k}
                  <span className="sr-only">{done ? ": done" : ": not yet"}</span>
                </li>
              );
            })}
          </ul>
        )}
        {m.updateText && <p className="rounded-2xl bg-white/60 px-3 py-2 text-sm">{m.updateText}</p>}
        <div>
          <div className="mb-1 flex justify-between text-xs font-medium text-ink-muted">
            <span>Commitment</span>
            <span>{m.commitmentPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-accent/15" aria-hidden="true">
            <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${m.commitmentPct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </div>
      </GlassCard>
    </li>
  );
}
