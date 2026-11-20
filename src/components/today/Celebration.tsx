"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { GlassButton, GlassCard } from "@/components/ui";
import type { TrackerPayload } from "@/server/tracker/respond";

const SPARKS = Array.from({ length: 14 }, (_, i) => i);

/** Shown when the day number reaches 75. Dismissible; the checklist stays underneath. */
export function Celebration({ summary }: { summary: NonNullable<TrackerPayload["summary"]> }) {
  const [open, setOpen] = useState(true);
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          key="celebration"
          role="dialog"
          aria-labelledby="celebration-title"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
        >
          <GlassCard className="relative overflow-hidden p-6 text-center">
            {!reduce &&
              SPARKS.map((i) => (
                <motion.span
                  key={i}
                  aria-hidden="true"
                  className="absolute left-1/2 top-16 size-2 rounded-full"
                  style={{ backgroundColor: ["#4f46e5", "#f59e0b", "#10b981", "#ec4899"][i % 4] }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: Math.cos((i / SPARKS.length) * Math.PI * 2) * 140, y: Math.sin((i / SPARKS.length) * Math.PI * 2) * 100, opacity: 0, scale: 0.4 }}
                  transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 }}
                />
              ))}
            <p aria-hidden="true" className="text-5xl">🏆</p>
            <h2 id="celebration-title" className="mt-2 text-3xl font-semibold tracking-tight">Day {summary.totalDays}. You did it.</h2>
            <p className="mt-1 text-ink-muted">Seventy-five days of showing up.</p>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="glass rounded-2xl p-3">
                <dt className="text-xs font-medium text-ink-muted">Days completed</dt>
                <dd className="text-2xl font-semibold">{summary.completedDays}<span className="text-sm text-ink-muted">/{summary.totalDays}</span></dd>
              </div>
              <div className="glass rounded-2xl p-3">
                <dt className="text-xs font-medium text-ink-muted">Completion</dt>
                <dd className="text-2xl font-semibold">{summary.completionPct}%</dd>
              </div>
              <div className="glass rounded-2xl p-3">
                <dt className="text-xs font-medium text-ink-muted">Best run</dt>
                <dd className="text-2xl font-semibold">{summary.longestRun}<span className="text-sm text-ink-muted"> days</span></dd>
              </div>
            </dl>
            <GlassButton onClick={() => setOpen(false)} className="mt-5 w-full">Continue</GlassButton>
          </GlassCard>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
