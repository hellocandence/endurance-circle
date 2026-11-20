import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Bar } from "@/components/progress/Bar";
import { Heatmap } from "@/components/progress/Heatmap";
import { StatTiles } from "@/components/progress/StatTiles";
import { WeekChart } from "@/components/progress/WeekChart";
import { GlassCard } from "@/components/ui";
import { requestNow } from "@/server/clock";
import { getMemberAnalytics, getMyStats } from "@/server/dashboard/analytics";
import { sessionActor } from "@/server/auth/session-user";
import { getDb } from "@/server/db";
import { can } from "@/server/rbac/can";

export const metadata = { title: "Progress · Cadence" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function MemberProgressPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const actor = await sessionActor();
  if (!actor) redirect("/login");
  if (!UUID.test(userId)) notFound();

  const db = getDb();
  const now = await requestNow();
  const isMe = actor.id === userId;
  // The detailed numbers read the full day rows, so they are loaded for the signed-in member's own page only.
  const [member, mine] = await Promise.all([
    getMemberAnalytics(db, userId, now),
    isMe && can(actor, "read", { kind: "journey", ownerId: actor.id }) ? getMyStats(db, actor.id, now) : Promise.resolve(null),
  ]);
  if (!member) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/progress" className="glass-focus w-fit rounded-full text-sm font-medium text-accent-strong underline-offset-4 hover:underline">← All progress</Link>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {member.name}
          {isMe && <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 align-middle text-xs font-medium text-accent-strong">You</span>}
        </h1>
        {isMe && member.programme && (
          <Link href="/progress/share" className="glass-focus hover-lift mt-2 inline-block rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glass-press hover:bg-accent-strong">Share story</Link>
        )}
        <p className="text-ink-muted">
          {member.programme && member.dayNumber ? `Day ${member.dayNumber} of ${member.programme.totalDays}` : "Hasn't started the programme yet."}
        </p>
      </header>

      {member.stats && member.programme && (
        <>
          <StatTiles stats={member.stats} />
          <GlassCard className="flex flex-col gap-3 p-4">
            <h2 className="font-semibold">Every day</h2>
            <Heatmap cells={member.cells} />
          </GlassCard>
          <GlassCard className="flex flex-col gap-2 p-4">
            <h2 className="font-semibold">Week by week</h2>
            <p className="text-sm text-ink-muted">Share of finished days completed in each week.</p>
            <WeekChart weeks={member.weeks} />
          </GlassCard>
        </>
      )}

      {member.updates.length > 0 && (
        <GlassCard className="flex flex-col gap-2 p-4">
          <h2 className="font-semibold">Recent updates</h2>
          <ul className="flex flex-col gap-2">
            {member.updates.map((u) => (
              <li key={u.date} className="text-sm">
                <span className="text-ink-muted">{dateFmt.format(new Date(`${u.date}T00:00:00Z`))}</span> · {u.text}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {mine && (
        <GlassCard className="flex flex-col gap-3 p-4" role="region" aria-label="Your private stats">
          <div>
            <h2 className="font-semibold">Your private stats</h2>
            <p className="text-sm text-ink-muted">Only you see this. It uses your own targets from Settings.</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-ink-muted">Total run</dt><dd className="text-lg font-semibold">{mine.totals.runKm} km</dd></div>
            <div><dt className="text-ink-muted">Study</dt><dd className="text-lg font-semibold">{mine.totals.studyHours} h</dd></div>
            <div><dt className="text-ink-muted">Reading</dt><dd className="text-lg font-semibold">{mine.totals.readingMin} min</dd></div>
            <div><dt className="text-ink-muted">Water per day</dt><dd className="text-lg font-semibold">{mine.totals.avgWaterL} L</dd></div>
          </dl>
          <div className="flex flex-col gap-3">
            {mine.tasks.map((t) => (
              <Bar key={t.key} label={t.label} value={t.pct} detail={`${t.done} of ${t.required} days`} />
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
