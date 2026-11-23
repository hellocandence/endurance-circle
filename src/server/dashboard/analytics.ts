import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { bodyMetrics } from "@/server/db/schema";
import { getJourneyRows } from "@/server/tracker/journey";
import {
  addDays,
  completion,
  DEFAULT_CONFIG,
  isSunday,
  longestPerfectRun,
  perfectDaysInARow,
  requiredTasks,
  TASK_KEYS,
  TASK_LABELS,
  taskStatus,
  type TaskKey,
  type TrackerConfig,
} from "@/server/tracker";
import { n, toInput } from "@/server/tracker/service";
import { loadCircle, type ProgressRow } from "./public";

/*
 * Analytics for the Progress tab. Everything here that another member can see is built from the PUBLIC
 * columns only (done/required counts, completed flag, public update line), never body metrics, task
 * amounts or private notes. Per-task and amount statistics exist only in `getMyStats`, for the member themself.
 */

export type DayState = "done" | "missed" | "today" | "future";
export type DayCell = { n: number; date: string; state: DayState; done: number; required: number };

type LogLite = { logDate: string; completed: boolean; doneCount: number; requiredCount: number };

/** One cell per programme day: done, missed, today (still in progress) or upcoming. */
export function buildDaySeries(input: { startDate: string; totalDays: number; today: string; logs: LogLite[] }): DayCell[] {
  const byDate = new Map(input.logs.map((l) => [l.logDate, l]));
  const cells: DayCell[] = [];
  for (let i = 1; i <= input.totalDays; i++) {
    const date = addDays(input.startDate, i - 1);
    const log = byDate.get(date);
    const required = log?.requiredCount || requiredTasks(isSunday(date)).length;
    const done = log?.doneCount ?? 0;
    let state: DayState;
    if (date > input.today) state = "future";
    else if (log?.completed) state = "done";
    else state = date === input.today ? "today" : "missed";
    cells.push({ n: i, date, state, done, required });
  }
  return cells;
}

export type WeekBar = { week: number; completed: number; elapsed: number; pct: number | null };

/** Completed days per 7-day block (the last block of a 75-day programme has 5 days). */
export function weeklyBars(cells: DayCell[]): WeekBar[] {
  const bars: WeekBar[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const block = cells.slice(i, i + 7);
    const completed = block.filter((c) => c.state === "done").length;
    const elapsed = block.filter((c) => c.state === "done" || c.state === "missed").length;
    bars.push({ week: i / 7 + 1, completed, elapsed, pct: elapsed ? Math.round((completed / elapsed) * 100) : null });
  }
  return bars;
}

export type MemberStats = {
  completionPct: number;
  completedDays: number;
  elapsedDays: number;
  streak: number;
  longestRun: number;
  avgTaskPct: number; // share of required tasks ticked over finished days
  bestWeek: number | null;
  daysLeft: number;
};

export function memberStats(cells: DayCell[], programme: { startDate: string; totalDays: number }, today: string): MemberStats {
  const days = cells.map((c) => ({ date: c.date, completed: c.state === "done", doneCount: c.done, requiredCount: c.required }));
  const win = completion(days, { ...programme, today });
  const finished = cells.filter((c) => c.state === "done" || c.state === "missed" || (c.state === "today" && c.done > 0)); // today joins once something is ticked
  const required = finished.reduce((s, c) => s + c.required, 0);
  const done = finished.reduce((s, c) => s + Math.min(c.done, c.required), 0);
  const weeks = weeklyBars(cells).filter((w) => w.pct !== null);
  const best = weeks.length ? weeks.reduce((a, b) => ((b.pct ?? 0) > (a.pct ?? 0) ? b : a)) : null;
  return {
    completionPct: win.pct,
    completedDays: win.completed,
    elapsedDays: win.elapsed,
    streak: perfectDaysInARow(days, today),
    longestRun: longestPerfectRun(days),
    avgTaskPct: required ? Math.round((done / required) * 100) : 0,
    bestWeek: best ? best.week : null,
    daysLeft: cells.filter((c) => c.state === "future").length,
  };
}

export type MemberAnalytics = {
  id: string;
  name: string;
  avatarUrl: string | null;
  dayNumber: number | null;
  programme: { startDate: string; totalDays: number } | null;
  cells: DayCell[];
  weeks: WeekBar[];
  stats: MemberStats | null;
  updates: { date: string; text: string }[]; // the member's public update lines, newest first
  /** Day by day, newest first, from public columns only: which tasks were ticked and the public update line. */
  log: ActivityDay[];
};

export type ActivityDay = { date: string; dayNumber: number; state: DayState; done: number; required: number; tasks: { key: string; label: string; done: boolean }[]; updateText: string | null };

/** One member's public analytics. Null when the member does not exist, is disabled or has not confirmed their email. */
export async function getMemberAnalytics(db: Db, userId: string, now = new Date()): Promise<MemberAnalytics | null> {
  const [entry] = await loadCircle(db, now, userId);
  if (!entry) return null;
  const { person, programme, logs, today } = entry;
  const base = {
    id: person.id,
    name: person.name,
    avatarUrl: person.avatarPhotoId ? `/api/photos/${person.id}?size=128&v=${person.avatarPhotoId}` : null,
    updates: logs.filter((l) => l.updateText).slice(0, 5).map((l) => ({ date: l.logDate, text: l.updateText as string })),
  };
  if (!programme) return { ...base, dayNumber: null, programme: null, cells: [], weeks: [], stats: null, log: [] };
  const prog = { startDate: programme.startDate, totalDays: programme.totalDays };
  const cells = buildDaySeries({ ...prog, today, logs });
  const started = cells.filter((c) => c.state !== "future").length;
  const byDate = new Map(logs.map((l) => [l.logDate, l]));
  const log: ActivityDay[] = cells
    .filter((c) => c.state !== "future")
    .reverse()
    .slice(0, 14)
    .map((c) => {
      const row = byDate.get(c.date);
      const ticked = new Set<string>(row?.doneTasks ?? []);
      return {
        date: c.date,
        dayNumber: c.n,
        state: c.state,
        done: c.done,
        required: c.required,
        tasks: requiredTasks(isSunday(c.date)).map((key) => ({ key, label: TASK_LABELS[key], done: ticked.has(key) })),
        updateText: row?.updateText ?? null,
      };
    });
  return { ...base, dayNumber: started || null, programme: prog, cells, weeks: weeklyBars(cells), stats: memberStats(cells, prog, today), log };
}

export type OverviewRow = ProgressRow & {
  streak: number;
  avgTaskPct: number;
  recent: DayState[]; // the last 14 programme days up to today, oldest first
};

export type TrendPoint = { date: string; pct: number | null; completed: number; enrolled: number };

/** Progress tab: per-member rows with a streak and a 14-day strip, plus how much of the circle finished each recent day. */
export async function getProgressOverview(db: Db, now = new Date(), trendDays = 14): Promise<{ rows: OverviewRow[]; trend: TrendPoint[] }> {
  const circle = await loadCircle(db, now);
  const rows: OverviewRow[] = [];
  const perMember: { start: string; total: number; done: Set<string> }[] = [];

  for (const { person, programme, logs, days, today } of circle) {
    const none = { completed: 0, elapsed: 0, pct: 0 };
    if (!programme) {
      rows.push({ id: person.id, displayName: person.name, dayNumber: null, window: none, last7: none, streak: 0, avgTaskPct: 0, recent: [] });
      continue;
    }
    const prog = { startDate: programme.startDate, totalDays: programme.totalDays };
    const cells = buildDaySeries({ ...prog, today, logs });
    const stats = memberStats(cells, prog, today);
    const started = cells.filter((c) => c.state !== "future");
    rows.push({
      id: person.id,
      displayName: person.name,
      dayNumber: started.length || null,
      window: completion(days, { ...prog, today }),
      last7: completion(days, { ...prog, today, lastDays: 7 }),
      streak: stats.streak,
      avgTaskPct: stats.avgTaskPct,
      recent: started.slice(-14).map((c) => c.state),
    });
    perMember.push({ start: programme.startDate, total: programme.totalDays, done: new Set(days.filter((d) => d.completed).map((d) => d.date)) });
  }
  rows.sort((a, b) => b.window.pct - a.window.pct || a.displayName.localeCompare(b.displayName));

  // The circle trend ends yesterday (relative to the latest "today" among members), so an unfinished day never drags it down.
  const latestToday = circle.reduce((max, c) => (c.today > max ? c.today : max), "");
  const trend: TrendPoint[] = [];
  if (latestToday) {
    for (let i = trendDays; i >= 1; i--) {
      const date = addDays(latestToday, -i);
      const enrolled = perMember.filter((m) => m.start <= date && date <= addDays(m.start, m.total - 1));
      const completed = enrolled.filter((m) => m.done.has(date)).length;
      trend.push({ date, pct: enrolled.length ? Math.round((completed / enrolled.length) * 100) : null, completed, enrolled: enrolled.length });
    }
  }
  return { rows, trend };
}

export type MyStats = {
  tasks: { key: TaskKey; label: string; done: number; required: number; pct: number }[];
  totals: { runKm: number; studyHours: number; readingMin: number; avgWaterL: number; avgProteinG: number; loggedDays: number };
};

/**
 * The member's OWN detailed numbers: per-task consistency against their own targets and totals. This reads
 * the full day rows, so it must only ever be called for the signed-in member (the page checks that).
 */
export async function getMyStats(db: Db, userId: string, now = new Date()): Promise<MyStats | null> {
  const journey = await getJourneyRows(db, userId, now);
  if (!journey?.programme) return null;
  const [metrics] = await db.select().from(bodyMetrics).where(eq(bodyMetrics.userId, userId)).limit(1);
  const config: TrackerConfig = metrics
    ? {
        runTargetKm: n(metrics.runTargetKm),
        waterTargetL: n(metrics.waterTargetL),
        studyMinTarget: metrics.studyMinTarget,
        weightKg: metrics.weightKg === null ? null : Number(metrics.weightKg),
        proteinMultiplier: n(metrics.proteinMultiplier),
      }
    : DEFAULT_CONFIG;

  const counts = new Map<TaskKey, { done: number; required: number }>(TASK_KEYS.map((k) => [k, { done: 0, required: 0 }]));
  const t = { runKm: 0, studyMin: 0, readingMin: 0, water: 0, protein: 0 };
  let logged = 0;
  for (const row of journey.rows) {
    const input = toInput(row);
    logged++;
    t.runKm += input.runKm;
    t.studyMin += input.studyMin;
    t.readingMin += input.readingMin;
    t.water += input.waterL;
    t.protein += input.proteinG;
    // Only finished days (or ones already completed) count against a task, so an unfinished today is not "missed".
    const finished = row.completed || row.dayNumber < (journey.programme.dayNumber ?? 0);
    if (!finished) continue;
    const status = taskStatus(input, config);
    for (const key of requiredTasks(row.isSunday)) {
      const c = counts.get(key)!;
      c.required++;
      if (status[key]) c.done++;
    }
  }
  const round1 = (x: number) => Math.round(x * 10) / 10;
  return {
    tasks: TASK_KEYS.filter((k) => counts.get(k)!.required > 0).map((key) => {
      const c = counts.get(key)!;
      return { key, label: TASK_LABELS[key], done: c.done, required: c.required, pct: Math.round((c.done / c.required) * 100) };
    }),
    totals: {
      runKm: round1(t.runKm),
      studyHours: round1(t.studyMin / 60),
      readingMin: t.readingMin,
      avgWaterL: logged ? round1(t.water / logged) : 0,
      avgProteinG: logged ? Math.round(t.protein / logged) : 0,
      loggedDays: logged,
    },
  };
}
