import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DayLogCard } from "@/components/progress/DayLogCard";
import { GlassCard } from "@/components/ui";
import { requestNow } from "@/server/clock";
import { getDailyLogs } from "@/server/dashboard/daily-logs";
import { sessionActor } from "@/server/auth/session-user";
import { getDb } from "@/server/db";

export const metadata = { title: "Daily logs · Endurance Circle" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DailyLogsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const actor = await sessionActor();
  if (!actor) redirect("/login");
  if (!UUID.test(userId)) notFound();

  const data = await getDailyLogs(getDb(), actor, userId, await requestNow());
  if (!data) notFound();
  const { member, days } = data;
  const isMe = actor.id === userId;
  const total = member.programme?.totalDays ?? 75;

  return (
    <div className="flex flex-col gap-4">
      <Link href={isMe ? "/progress" : `/progress/${userId}`} className="glass-focus w-fit rounded-full text-sm font-medium text-accent-strong underline-offset-4 hover:underline">
        ← {isMe ? "Progress" : member.name}
      </Link>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{isMe ? "My daily logs" : `${member.name}'s daily logs`}</h1>
        <p className="text-ink-muted">
          Every day, newest first, with everything that was logged. A day locks when it ends and can no longer be edited, so after day {total} this is the full report.
        </p>
      </header>

      {member.stats && (
        <GlassCard className="flex flex-wrap items-center gap-x-6 gap-y-1 p-4 text-sm">
          <span><strong className="text-lg">{member.stats.completedDays}</strong> perfect of {member.stats.elapsedDays} days</span>
          <span><strong className="text-lg">{member.stats.completionPct}%</strong> overall</span>
          <span><strong className="text-lg">{member.stats.streak}</strong> day streak</span>
          <span><strong className="text-lg">{member.stats.longestRun}</strong> longest</span>
        </GlassCard>
      )}

      {days.length === 0 ? (
        <GlassCard className="p-5">
          <p className="text-ink-muted">{isMe ? "No days yet. Your logs appear here from day 1." : `${member.name} hasn't started the programme yet.`}</p>
        </GlassCard>
      ) : (
        <ol aria-label="Daily logs" className="flex flex-col gap-3">
          {days.map((d) => (
            <li key={d.date}>
              <DayLogCard day={d} open={d.state === "today"} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
