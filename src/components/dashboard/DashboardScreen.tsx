"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import { GlassButton } from "@/components/ui";
import type { CirclePulse } from "@/server/dashboard/public";
import { MemberCard, type CardMember } from "./MemberCard";
import { PrivateTab, type MyJourney } from "./PrivateTab";
import { PulseCard } from "./PulseCard";
import { usePullToRefresh } from "./usePullToRefresh";

const TABS = [
  { id: "public", label: "Circle" },
  { id: "private", label: "You" },
] as const;

export function DashboardScreen({ members, pulse, journey }: { members: CardMember[]; pulse: CirclePulse; journey: MyJourney }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("public");
  const [refreshing, startRefresh] = useTransition();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const refresh = () => startRefresh(() => router.refresh());
  const { pull, ready } = usePullToRefresh(refresh);

  function onKey(e: KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        aria-hidden="true"
        className="-mb-2 flex h-0 items-end justify-center overflow-visible text-sm font-medium text-ink-muted"
        style={{ transform: reduce ? undefined : `translateY(${pull / 2}px)` }}
      >
        {(pull > 0 || refreshing) && <span className="glass rounded-full px-3 py-1">{refreshing ? "Refreshing…" : ready ? "Release to refresh" : "Pull to refresh"}</span>}
      </div>

      <header className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Circle</h1>
        <GlassButton variant="ghost" onClick={refresh} disabled={refreshing} className="px-4" aria-label="Refresh dashboard">
          {refreshing ? "Refreshing…" : "Refresh"}
        </GlassButton>
      </header>

      <div role="tablist" aria-label="Dashboard sections" onKeyDown={onKey} className="glass relative flex rounded-full p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[t.id] = el; }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className="glass-focus relative min-h-11 flex-1 rounded-full text-sm font-semibold text-ink-muted aria-selected:text-accent-strong"
          >
            {tab === t.id && <motion.span layoutId="dash-tab" className="absolute inset-0 -z-10 rounded-full bg-glass-strong shadow-glass-press" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "public" ? (
        <div role="tabpanel" id="panel-public" aria-labelledby="tab-public" className="flex flex-col gap-4">
          <PulseCard pulse={pulse} />
          <ul className="flex flex-col gap-3" aria-label="Members">
            {members.map((m, i) => <MemberCard key={m.id} m={m} index={i} />)}
          </ul>
        </div>
      ) : (
        <div role="tabpanel" id="panel-private" aria-labelledby="tab-private">
          <PrivateTab journey={journey} />
        </div>
      )}
    </div>
  );
}
