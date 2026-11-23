import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { commitments, dailyLogs, users } from "@/server/db/schema";
import { completion, longestPerfectRun, perfectDaysInARow } from "./progress";
import { dayNumber, requiredTasks } from "./rules";
import { isSunday, localDate } from "./dates";

/** Raw rows for one member's journey (the caller passes them through the privateJourney projection). */
export async function getJourneyRows(db: Db, userId: string, now = new Date()) {
  const [user] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [programme] = await db
    .select()
    .from(commitments)
    .where(and(eq(commitments.userId, userId), eq(commitments.active, true)))
    .orderBy(desc(commitments.startDate))
    .limit(1);
  if (!programme) return { programme: null, rows: [], stats: null };

  const today = localDate(now, user.timeZone);
  const stored = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.commitmentId, programme.id)))
    .orderBy(desc(dailyLogs.logDate));
  // Days are locked once they end, so a miss can no longer be written by a later save (BR4): a finished day's
  // missed tasks are its required tasks that were not ticked.
  const rows = stored.map((r) => (r.logDate < today ? { ...r, missedTasks: requiredTasks(isSunday(r.logDate)).filter((k) => !r.doneTasks.includes(k)) } : r));
  const days = rows.map((r) => ({ date: r.logDate, completed: r.completed, doneCount: r.doneCount, requiredCount: r.requiredCount }));
  const win = { startDate: programme.startDate, today, totalDays: programme.totalDays };

  return {
    programme: { startDate: programme.startDate, totalDays: programme.totalDays, dayNumber: dayNumber(programme.startDate, today) },
    rows,
    stats: {
      window: completion(days, win),
      last7: completion(days, { ...win, lastDays: 7 }),
      perfectDaysInARow: perfectDaysInARow(days, today),
      longestRun: longestPerfectRun(days),
    },
  };
}
