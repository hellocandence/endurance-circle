import Link from "next/link";
import { redirect } from "next/navigation";
import { StoryShare } from "@/components/share/StoryShare";
import { GlassCard } from "@/components/ui";
import type { StoryData } from "@/lib/story/draw";
import { requestNow } from "@/server/clock";
import { getMemberAnalytics } from "@/server/dashboard/analytics";
import { sessionActor } from "@/server/auth/session-user";
import { getDb } from "@/server/db";
import { TASK_LABELS } from "@/server/tracker/rules";
import { trackerPayload } from "@/server/tracker/respond";
import { getToday } from "@/server/tracker/service";

export const metadata = { title: "Share your day · Cadence" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function SharePage() {
  const actor = await sessionActor();
  if (!actor) redirect("/login");
  const db = getDb();
  const now = await requestNow();
  const [today, analytics] = await Promise.all([getToday(db, actor.id, now), getMemberAnalytics(db, actor.id, now)]);
  const { body } = trackerPayload(actor, today); // own data, through the privacy projection

  if ("error" in body || !analytics?.stats || !analytics.programme) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Share your day</h1>
        <GlassCard className="flex flex-col gap-3 p-5">
          <p className="text-ink-muted">Start your 75 Hard first, then you can share a story of your day.</p>
          <Link href="/today" className="glass-focus w-fit rounded-full font-medium text-accent-strong underline-offset-4 hover:underline">Go to Today</Link>
        </GlassCard>
      </div>
    );
  }

  const log = body.log;
  const data: StoryData = {
    name: actor.name,
    dateLabel: dateFmt.format(new Date(`${body.date}T00:00:00Z`)),
    dayNumber: body.dayNumber ?? analytics.dayNumber ?? 1,
    totalDays: body.totalDays,
    done: body.evaluation.doneCount,
    required: body.evaluation.requiredCount,
    tasks: body.evaluation.required.map((k) => ({ label: TASK_LABELS[k], done: body.evaluation.done.includes(k) })),
    streak: analytics.stats.streak,
    completionPct: analytics.stats.completionPct,
    cells: analytics.cells.map((c) => c.state),
    details: { runKm: Number(log?.runKm ?? 0), waterL: Number(log?.waterL ?? 0), studyMin: log?.studyMin ?? 0, readingMin: log?.readingMin ?? 0 },
    update: log?.updateText ?? null,
  };

  return (
    <div className="flex flex-col gap-4">
      <Link href="/progress" className="glass-focus w-fit rounded-full text-sm font-medium text-accent-strong underline-offset-4 hover:underline">← Progress</Link>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Share your day</h1>
        <p className="text-ink-muted">A 9:16 picture for your Instagram or WhatsApp story. It is made on your phone and never uploaded.</p>
      </header>
      <StoryShare data={data} />
    </div>
  );
}
