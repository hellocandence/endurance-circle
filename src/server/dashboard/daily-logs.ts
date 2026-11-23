import type { Db } from "@/server/db/client";
import { bodyMetrics, privateJourney } from "@/server/privacy";
import type { Actor } from "@/server/rbac/can";
import { getBodyRow } from "@/server/body/service";
import { isSunday, requiredTasks, TASK_LABELS } from "@/server/tracker";
import { getJourneyRows } from "@/server/tracker/journey";
import { getMemberAnalytics, type DayState, type MemberAnalytics } from "./analytics";

/*
 * The member's day-by-day record, every field. T104: the circle is open, so any signed-in member can read
 * anyone's logs (`privateJourney` still checks `can()`); only the member ever writes them, and a day is locked
 * once their local date has moved on (T105), so what is read here no longer changes after the day ends.
 */

export type LoggedDay = ReturnType<typeof privateJourney>["logs"][number];

export type DailyLogDay = {
  n: number;
  date: string;
  state: Exclude<DayState, "future">;
  locked: boolean; // finished days can no longer be edited
  done: number;
  required: number;
  tasks: { key: string; label: string; done: boolean }[];
  log: LoggedDay | null; // null when nothing was saved that day
};

export type DailyLogs = {
  member: Pick<MemberAnalytics, "id" | "name" | "avatarUrl" | "dayNumber" | "programme" | "stats">;
  days: DailyLogDay[]; // newest first, from today back to day 1
};

/** One member's full daily logs, or null when the member is unknown, disabled or unconfirmed. */
export async function getDailyLogs(db: Db, actor: Actor, userId: string, now = new Date()): Promise<DailyLogs | null> {
  const member = await getMemberAnalytics(db, userId, now);
  if (!member) return null;
  const { id, name, avatarUrl, dayNumber, programme, stats } = member;
  const base = { member: { id, name, avatarUrl, dayNumber, programme, stats } };
  if (!programme) return { ...base, days: [] };

  const journey = await getJourneyRows(db, userId, now);
  const rows = journey?.rows ?? [];
  const logs = new Map(privateJourney(actor, userId, rows).logs.map((l) => [l.logDate, l]));
  const ticked = new Map(rows.map((r) => [r.logDate, new Set<string>(r.doneTasks)]));

  const days = member.cells
    .filter((c): c is typeof c & { state: Exclude<DayState, "future"> } => c.state !== "future")
    .reverse()
    .map((c) => ({
      n: c.n,
      date: c.date,
      state: c.state,
      locked: c.state !== "today",
      done: c.done,
      required: c.required,
      tasks: requiredTasks(isSunday(c.date)).map((key) => ({ key, label: TASK_LABELS[key], done: ticked.get(c.date)?.has(key) ?? false })),
      log: logs.get(c.date) ?? null,
    }));
  return { ...base, days };
}

/** A member's body metrics and targets (readable by the whole circle). Null until they have entered any. */
export async function getMemberBody(db: Db, actor: Actor, userId: string) {
  const row = await getBodyRow(db, userId);
  return row ? bodyMetrics(actor, userId, row) : null;
}
