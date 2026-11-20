import type { ReactNode } from "react";
import { GlassCard } from "@/components/ui";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-strong">Cadence</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-ink-muted">{subtitle}</p>}
      </header>
      <GlassCard className="flex flex-col gap-4 p-6">{children}</GlassCard>
    </main>
  );
}
