import { GlassCard } from "@/components/ui";

const fmt = (d: string) => new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Shown on Today while the 75 Hard is set to begin on a later day. The date is set by the owner, so there is nothing to change here. */
export function ScheduledStart({ startDate, daysUntil }: { startDate: string; daysUntil: number }) {
  return (
    <GlassCard className="flex flex-col gap-4 p-6">
      <div className="text-center">
        <p aria-hidden="true" className="text-4xl">🗓️</p>
        <h1 className="mt-2 text-2xl font-semibold">Your 75 Hard starts {fmt(startDate)}</h1>
        <p className="text-ink-muted">{daysUntil === 1 ? "That is tomorrow." : `That is in ${daysUntil} days.`} Day 1 begins at midnight your time. Until then you can look around the app.</p>
      </div>
    </GlassCard>
  );
}
