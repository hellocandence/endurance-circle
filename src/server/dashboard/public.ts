import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { commitments, dailyLogs, profiles, users } from "@/server/db/schema";
import { publicMember, type PublicMember } from "@/server/privacy";
import { publicLogColumns, publicUserColumns } from "@/server/privacy/columns";
import { completion, dayNumber, isSunday, localDate, perfectDaysInARow, requiredTasks, TASK_KEYS, TASK_LABELS } from "@/server/tracker";

export type CirclePulse = {
  memberCount: number;
  activeToday: number; // members who ticked at least one task today
  completedToday: number; // members whose day is complete
  tasksDone: number;
  tasksTotal: number;
  averageCompletionPct: number;
  /** Today, task by task: who has ticked it (public names only). */
  activity: { key: string; label: string; total: number; done: { id: string; name: string }[] }[];
};

/** Circle-wide summary, built from public member cards only. */
export function circlePulse(members: PublicMember[]): CirclePulse {
  const total = members.reduce((n, m) => n + m.todayTotal, 0);
  const done = members.reduce((n, m) => n + m.todayDone, 0);
  return {
    memberCount: members.length,
    activeToday: members.filter((m) => m.todayDone > 0).length,
    completedToday: members.filter((m) => m.todayTotal > 0 && m.todayDone >= m.todayTotal).length,
    tasksDone: done,
    tasksTotal: total,
    averageCompletionPct: members.length ? Math.round(members.reduce((n, m) => n + m.commitmentPct, 0) / members.length) : 0,
    activity: TASK_KEYS.map((key) => {
      const asked = members.filter((m) => m.requiredTasks.includes(key));
      return { key, label: TASK_LABELS[key], total: asked.length, done: asked.filter((m) => m.doneTasks.includes(key)).map((m) => ({ id: m.id, name: m.displayName })) };
    }).filter((a) => a.total > 0),
  };
}

type Day = { date: string; completed: boolean; doneCount: number; requiredCount: number };

/**
 * Loads every enabled member with their programme and day records, using ONLY the public column lists
 * (publicUserColumns, publicLogColumns): never body_metrics, never private notes.
 */
export async function loadCircle(db: Db, now = new Date(), only?: string) {
  const people = await db
    .select({ ...publicUserColumns, timeZone: users.timeZone, avatarPhotoId: profiles.avatarPhotoId }) // timeZone only picks "today"; it is never output
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.disabled, false), isNotNull(users.emailVerified), only ? eq(users.id, only) : undefined)) // invited-but-unconfirmed people are not members yet
    .orderBy(users.name);
  const ids = people.map((p) => p.id);
  if (ids.length === 0) return [];

  const programmes = await db
    .select({ id: commitments.id, userId: commitments.userId, startDate: commitments.startDate, totalDays: commitments.totalDays })
    .from(commitments)
    .where(and(inArray(commitments.userId, ids), eq(commitments.active, true)));
  const logs = programmes.length
    ? await db
        .select(publicLogColumns)
        .from(dailyLogs)
        .where(inArray(dailyLogs.commitmentId, programmes.map((p) => p.id)))
        .orderBy(desc(dailyLogs.logDate))
    : [];

  return people.map((p) => {
    const mine = logs.filter((l) => l.userId === p.id);
    const days: Day[] = mine.map((l) => ({ date: l.logDate, completed: l.completed, doneCount: l.doneCount, requiredCount: l.requiredCount }));
    return { person: p, programme: programmes.find((c) => c.userId === p.id) ?? null, logs: mine, days, today: localDate(now, p.timeZone) };
  });
}

/**
 * The circle feed: public member cards only. "6/8" comes from counts stored when each day was saved.
 */
export async function getPublicDashboard(db: Db, now = new Date()) {
  const circle = await loadCircle(db, now);
  const members = circle.map(({ person: p, programme, logs, days, today }) => {
    const todayLog = logs.find((l) => l.logDate === today);
    return publicMember({
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarPhotoId ? `/api/photos/${p.id}?size=128&v=${p.avatarPhotoId}` : null, // v busts the cache when the photo changes
      todayDone: todayLog?.doneCount ?? 0,
      todayTotal: todayLog?.requiredCount || requiredTasks(isSunday(today)).length,
      doneTasks: todayLog?.doneTasks ?? [],
      requiredTasks: requiredTasks(isSunday(today)),
      dayNumber: programme ? dayNumber(programme.startDate, today) : null,
      streak: perfectDaysInARow(days, today),
      updateText: logs.find((l) => l.updateText)?.updateText ?? null, // most recent public line (logs are newest first)
      commitmentPct: programme ? completion(days, { startDate: programme.startDate, today, totalDays: programme.totalDays }).pct : 0,
    });
  });
  return { members, pulse: circlePulse(members) };
}

export type ProgressRow = {
  id: string;
  displayName: string;
  dayNumber: number | null;
  window: { completed: number; elapsed: number; pct: number };
  last7: { completed: number; elapsed: number; pct: number };
};

/** Completion % over the whole window and the last 7 days, per member (public by design, F-05). */
export async function getProgressList(db: Db, now = new Date()): Promise<ProgressRow[]> {
  const rows = (await loadCircle(db, now)).map(({ person, programme, days, today }) => {
    const none = { completed: 0, elapsed: 0, pct: 0 };
    const win = programme ? { startDate: programme.startDate, today, totalDays: programme.totalDays } : null;
    return {
      id: person.id,
      displayName: person.name,
      dayNumber: programme ? dayNumber(programme.startDate, today) : null,
      window: win ? completion(days, win) : none,
      last7: win ? completion(days, { ...win, lastDays: 7 }) : none,
    };
  });
  return rows.sort((a, b) => b.window.pct - a.window.pct || a.displayName.localeCompare(b.displayName));
}
