import Link from "next/link";
import { redirect } from "next/navigation";
import { ProgressList } from "@/components/ProgressList";
import { TrendChart } from "@/components/progress/TrendChart";
import { GlassCard } from "@/components/ui";
import { requestNow } from "@/server/clock";
import { getProgressOverview } from "@/server/dashboard/analytics";
import { sessionActor } from "@/server/auth/session-user";
import { getDb } from "@/server/db";

export const metadata = { title: "Progress · Endurance Circle" };
export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const actor = await sessionActor();
  if (!actor) redirect("/login");
  const { rows, trend } = await getProgressOverview(getDb(), await requestNow());
  const hasTrend = trend.some((p) => p.pct !== null);
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Progress</h1>
          <p className="text-ink-muted">How everyone is doing so far. Tap a name for the full picture.</p>
        </div>
        <Link href="/progress/share" className="glass-focus hover-lift shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glass-press hover:bg-accent-strong">Share story</Link>
      </header>
      <Link href={`/progress/${actor.id}/logs`} className="glass-focus hover-lift w-fit rounded-full bg-white/70 px-4 py-2 text-sm font-semibold text-accent-strong shadow-glass-press hover:bg-white/90">My daily logs</Link>
      {hasTrend && (
        <GlassCard className="flex flex-col gap-2 p-4">
          <h2 className="font-semibold">Circle, last 14 days</h2>
          <p className="text-sm text-ink-muted">Share of members who finished each day.</p>
          <TrendChart points={trend} />
        </GlassCard>
      )}
      <ProgressList rows={rows} meId={actor.id} />
    </div>
  );
}
