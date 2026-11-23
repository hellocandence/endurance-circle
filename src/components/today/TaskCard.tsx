"use client";

import { motion } from "framer-motion";
import { useId, type ReactNode } from "react";
import { GlassCard } from "@/components/ui";

export function TaskCard({ title, done, partial = false, tag, children }: { title: string; done: boolean; partial?: boolean; tag?: string; children: ReactNode }) {
  const id = useId();
  return (
    <GlassCard role="group" aria-labelledby={id} aria-describedby={`${id}-state`} className="flex flex-col gap-3 p-4" data-done={done}>
      <div className="flex items-center gap-3">
        <motion.span
          aria-hidden="true"
          animate={{ scale: done ? [1, 1.25, 1] : 1, backgroundColor: done ? "#047857" : "rgba(79,70,229,0.12)" }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="grid size-7 shrink-0 place-items-center rounded-full text-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity={done ? 1 : 0}>
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </motion.span>
        <h2 id={id} className="flex-1 text-base font-semibold">
          {title}
        </h2>
        <span id={`${id}-state`} className="sr-only">{done ? "Done" : partial ? "Partly done, half credit" : "Not done yet"}</span>
        {partial && !done && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">Half credit</span>}
        {tag && <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-ink-muted">{tag}</span>}
      </div>
      {children}
    </GlassCard>
  );
}
