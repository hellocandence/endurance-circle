import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Bar } from "@/components/progress/Bar";
import { ActivityLog } from "@/components/progress/ActivityLog";
import { Heatmap } from "@/components/progress/Heatmap";
import { StatTiles } from "@/components/progress/StatTiles";
import { WeekChart } from "@/components/progress/WeekChart";
import { GlassCard } from "@/components/ui";
import { requestNow } from "@/server/clock";
import { getMemberAnalytics, getMyStats } from "@/server/dashboard/analytics";
import { getMemberBody } from "@/server/dashboard/daily-logs";
import { sessionActor } from "@/server/auth/session-user";
import { getDb } from "@/server/db";

export const metadata = { title: "Progress · Endurance Circle" };
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
  // The circle is open (T104): everyone sees every member's totals, targets and body numbers.
  const [member, totals, body] = await Promise.all([getMemberAnalytics(db, userId, now), getMyStats(db, userId, now), getMemberBody(db, actor, userId)]);
  if (!member) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/progress" className="glass-focus w-fit rounded-full text-sm font-medium text-accent-strong underline-offset-4 hover:underline">← All progress</Link>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {member.name}
          {isMe && <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 align-middle text-xs font-medium text-accent-strong">You</span>}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={`/progress/${userId}/logs`} className="glass-focus hover-lift inline-block rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glass-press hover:bg-accent-strong">{isMe ? "My daily logs" : "Daily logs"}</Link>
          {isMe && member.programme && (
            <Link href="/progress/share" className="glass-focus hover-lift inline-block rounded-full bg-white/70 px-4 py-2 text-sm font-semibold text-accent-strong shadow-glass-press hover:bg-white/90">Share story</Link>
          )}
        </div>
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
          <ActivityLog days={member.log} />
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

      {body && (
        <GlassCard className="flex flex-col gap-3 p-4" role="region" aria-label="Body and targets">
          <div>
            <h2 className="font-semibold">Body and targets</h2>
            <p className="text-sm text-ink-muted">Open to everyone in the circle. Only {isMe ? "you" : member.name} can change these.</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-ink-muted">Weight</dt><dd className="text-lg font-semibold">{body.weightKg === null ? "Not set" : `${body.weightKg} kg`}</dd></div>
            <div><dt className="text-ink-muted">Height</dt><dd className="text-lg font-semibold">{body.heightCm === null ? "Not set" : `${body.heightCm} cm`}</dd></div>
            <div><dt className="text-ink-muted">Protein target</dt><dd className="text-lg font-semibold">{body.proteinTargetG === null ? "Not set" : `${body.proteinTargetG} g`}</dd></div>
            <div><dt className="text-ink-muted">Run target</dt><dd className="text-lg font-semibold">{body.runTargetKm} km</dd></div>
            <div><dt className="text-ink-muted">Water target</dt><dd className="text-lg font-semibold">{body.waterTargetL} L</dd></div>
            <div><dt className="text-ink-muted">Study target</dt><dd className="text-lg font-semibold">{body.studyMinTarget} min</dd></div>
          </dl>
        </GlassCard>
      )}

      {totals && (
        <GlassCard className="flex flex-col gap-3 p-4" role="region" aria-label="Totals">
          <div>
            <h2 className="font-semibold">Totals</h2>
            <p className="text-sm text-ink-muted">Everything {isMe ? "you have" : "they have"} logged so far, against {isMe ? "your" : "their"} own targets.</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-ink-muted">Total run</dt><dd className="text-lg font-semibold">{totals.totals.runKm} km</dd></div>
            <div><dt className="text-ink-muted">Study</dt><dd className="text-lg font-semibold">{totals.totals.studyHours} h</dd></div>
            <div><dt className="text-ink-muted">Reading</dt><dd className="text-lg font-semibold">{totals.totals.readingMin} min</dd></div>
            <div><dt className="text-ink-muted">Water per day</dt><dd className="text-lg font-semibold">{totals.totals.avgWaterL} L</dd></div>
            <div><dt className="text-ink-muted">Protein per day</dt><dd className="text-lg font-semibold">{totals.totals.avgProteinG} g</dd></div>
          </dl>
          <div className="flex flex-col gap-3">
            {totals.tasks.map((t) => (
              <Bar key={t.key} label={t.label} value={t.pct} detail={`${t.done} of ${t.required} days`} />
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
