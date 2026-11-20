import type { ReactNode } from "react";
import { GlassCard } from "@/components/ui";

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <GlassCard role="region" aria-label={title} className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
    </GlassCard>
  );
}

export type Status = { kind: "idle" } | { kind: "saving" } | { kind: "ok"; text: string } | { kind: "error"; text: string };
