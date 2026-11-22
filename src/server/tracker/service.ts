import { and, desc, eq } from "drizzle-orm";
import { audit } from "@/server/admin/service";
import type { Db } from "@/server/db/client";
import { bodyMetrics, commitments, dailyLogs, users } from "@/server/db/schema";
import { addDays, daysBetween, isDateString, isSunday, localDate } from "./dates";
import { completion, longestPerfectRun } from "./progress";
import { dayNumber, DEFAULT_CONFIG, evaluateDay, proteinTarget, reachedFinalDay, type DayInput, type TrackerConfig } from "./rules";
import type { DayPatch } from "./schema";

type LogRow = typeof dailyLogs.$inferSelect;

export type TrackerError = "no_active_commitment" | "invalid_date" | "before_start" | "in_future" | "locked" | "not_started_yet";
export type Result<T> = ({ ok: true } & T) | { ok: false; error: TrackerError; startDate?: string };

/** Day 1 of the circle-wide fresh start (Monday). Members who have not joined by COHORT_GRACE_DAYS later pick their own date. */
export const COHORT_START = "2026-11-23";
export const COHORT_GRACE_DAYS = 6;

/** Today and yesterday can be edited (so a late-night log still lands on the right day). */
const EDITABLE_DAYS_BACK = 1;

export const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

export const toInput = (r: LogRow): DayInput => ({
  runKm: n(r.runKm),
  warmupPreDone: r.warmupPreDone,
  warmupPostDone: r.warmupPostDone,
  stretchMin: r.stretchMin,
  waterL: n(r.waterL),
  electrolytesDone: r.electrolytesDone,
  proteinG: r.proteinG,
  studyMin: r.studyMin,
  techNote: r.techNote,
  githubContribution: r.githubContribution,
  readingMin: r.readingMin,
});

const EMPTY_INPUT: DayInput = {
  runKm: 0, warmupPreDone: false, warmupPostDone: false, stretchMin: 0, waterL: 0, electrolytesDone: false,
  proteinG: 0, studyMin: 0, techNote: null, githubContribution: false, readingMin: 0,
};

async function context(db: Db, userId: string, now: Date) {
  const [user] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [commitment] = await db
    .select()
    .from(commitments)
    .where(and(eq(commitments.userId, userId), eq(commitments.active, true)))
    .orderBy(desc(commitments.startDate))
    .limit(1);
  if (!commitment) return null;
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
  return { commitment, config, today: localDate(now, user.timeZone) };
}

async function view(db: Db, userId: string, commitmentId: string, date: string, today: string, startDate: string, totalDays: number, config: TrackerConfig) {
  const [row] = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.commitmentId, commitmentId), eq(dailyLogs.logDate, date)))
    .limit(1);
  const day = dayNumber(startDate, date);
  const evaluation = evaluateDay(row ? toInput(row) : EMPTY_INPUT, { date, dayOver: date < today, config });
  const finalDay = reachedFinalDay(day, totalDays);

  // Day 75 summary: only computed when it is shown.
  let summary: { completedDays: number; totalDays: number; completionPct: number; longestRun: number } | null = null;
  if (finalDay) {
    const logs = await db
      .select({ date: dailyLogs.logDate, completed: dailyLogs.completed })
      .from(dailyLogs)
      .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.commitmentId, commitmentId)));
    // The viewed day counts with its live result (it may not be saved yet).
    const days = [...logs.filter((l) => l.date !== date), { date, completed: evaluation.completed }];
    const done = days.filter((d) => d.completed).length;
    summary = {
      completedDays: Math.min(done, totalDays),
      totalDays,
      completionPct: completion(days, { startDate, today: date, totalDays }).pct,
      longestRun: longestPerfectRun(days),
    };
  }
  return {
    date,
    isToday: date === today,
    isSunday: isSunday(date),
    dayNumber: day,
    totalDays,
    finalDay,
    summary,
    proteinTargetG: proteinTarget(config.weightKg, config.proteinMultiplier),
    targets: { runKm: config.runTargetKm, waterL: config.waterTargetL, studyMin: config.studyMinTarget },
    row: row ?? null,
    evaluation,
  };
}

export type DayView = Awaited<ReturnType<typeof view>>;
export type DayResponse = Result<{ data: DayView }>;

/** The member's own view of today (nothing is written). */
export async function getToday(db: Db, userId: string, now = new Date()): Promise<DayResponse> {
  const ctx = await context(db, userId, now);
  if (!ctx) return { ok: false, error: "no_active_commitment" };
  const { commitment, config, today } = ctx;
  // A programme set to start later: nothing to log yet (the Today screen shows the countdown instead).
  if (today < commitment.startDate) return { ok: false, error: "not_started_yet", startDate: commitment.startDate };
  return { ok: true, data: await view(db, userId, commitment.id, today, today, commitment.startDate, commitment.totalDays, config) };
}

/**
 * Create or update the member's own log for a date. Partial: only the fields in `patch` change.
 * Completion, day number, Sunday flag and missed tasks are always recomputed here, never trusted from the client.
 */
export async function saveDay(
  db: Db,
  userId: string,
  date: string,
  patch: DayPatch,
  now = new Date(),
): Promise<DayResponse> {
  if (!isDateString(date)) return { ok: false, error: "invalid_date" };
  const ctx = await context(db, userId, now);
  if (!ctx) return { ok: false, error: "no_active_commitment" };
  const { commitment, config, today } = ctx;

  if (date > today) return { ok: false, error: "in_future" };
  if (date < commitment.startDate) return { ok: false, error: "before_start" };
  if (date < addDays(today, -EDITABLE_DAYS_BACK)) return { ok: false, error: "locked" };

  const [existing] = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.commitmentId, commitment.id), eq(dailyLogs.logDate, date)))
    .limit(1);

  const values = {
    runKm: patch.runKm !== undefined ? String(patch.runKm) : undefined,
    warmupPreDone: patch.warmupPreDone,
    warmupPostDone: patch.warmupPostDone,
    stretchMin: patch.stretchMin,
    waterL: patch.waterL !== undefined ? String(patch.waterL) : undefined,
    electrolytesDone: patch.electrolytesDone,
    proteinG: patch.proteinG,
    studyMin: patch.studyMin,
    studyTopic: patch.studyTopic,
    techNote: patch.techNote,
    githubContribution: patch.githubContribution,
    readingMin: patch.readingMin,
    readingTitle: patch.readingTitle,
    updateText: patch.updateText,
    privateNotes: patch.privateNotes,
  };
  const defined = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));

  // Merge with what is stored, then recompute the derived fields from the merged result.
  const merged: DayInput = { ...(existing ? toInput(existing) : EMPTY_INPUT) };
  Object.assign(merged, {
    ...(patch.runKm !== undefined && { runKm: patch.runKm }),
    ...(patch.warmupPreDone !== undefined && { warmupPreDone: patch.warmupPreDone }),
    ...(patch.warmupPostDone !== undefined && { warmupPostDone: patch.warmupPostDone }),
    ...(patch.stretchMin !== undefined && { stretchMin: patch.stretchMin }),
    ...(patch.waterL !== undefined && { waterL: patch.waterL }),
    ...(patch.electrolytesDone !== undefined && { electrolytesDone: patch.electrolytesDone }),
    ...(patch.proteinG !== undefined && { proteinG: patch.proteinG }),
    ...(patch.studyMin !== undefined && { studyMin: patch.studyMin }),
    ...(patch.techNote !== undefined && { techNote: patch.techNote }),
    ...(patch.githubContribution !== undefined && { githubContribution: patch.githubContribution }),
    ...(patch.readingMin !== undefined && { readingMin: patch.readingMin }),
  });
  const result = evaluateDay(merged, { date, dayOver: date < today, config });
  const derived = {
    dayNumber: dayNumber(commitment.startDate, date)!, // date >= startDate was checked above
    isSunday: isSunday(date),
    completed: result.completed,
    doneCount: result.doneCount,
    requiredCount: result.requiredCount,
    doneTasks: result.done,
    missedTasks: result.missed, // logged for finished days; never resets the day count (BR4)
  };

  await db
    .insert(dailyLogs)
    .values({ userId, commitmentId: commitment.id, logDate: date, ...defined, ...derived })
    .onConflictDoUpdate({
      target: [dailyLogs.userId, dailyLogs.commitmentId, dailyLogs.logDate],
      set: { ...defined, ...derived },
    });

  return { ok: true, data: await view(db, userId, commitment.id, date, today, commitment.startDate, commitment.totalDays, config) };
}

/** How far ahead a start date may be chosen. */
export const MAX_START_AHEAD_DAYS = 60;

/** A chosen start date must be a real date from the member's today up to MAX_START_AHEAD_DAYS ahead. */
function chooseStart(startDate: string | undefined, today: string): string | null {
  if (startDate === undefined) return today;
  if (!isDateString(startDate) || startDate < today || startDate > addDays(today, MAX_START_AHEAD_DAYS)) return null;
  return startDate;
}

async function localToday(db: Db, userId: string, now: Date) {
  const [user] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("user not found");
  return localDate(now, user.timeZone);
}

/**
 * Start the member's own 75 Hard on `startDate` (default: their local today, up to 60 days ahead).
 * Idempotent: an active programme is kept (use restartProgram to replace it).
 */
export async function startProgram(db: Db, userId: string, now = new Date(), startDate?: string): Promise<{ created: boolean } | { error: "invalid_date" }> {
  const today = await localToday(db, userId, now);
  const chosen = chooseStart(startDate, today);
  if (!chosen) return { error: "invalid_date" };
  const [existing] = await db
    .select({ id: commitments.id })
    .from(commitments)
    .where(and(eq(commitments.userId, userId), eq(commitments.active, true)))
    .limit(1);
  if (existing) return { created: false };
  await db.insert(commitments).values({ userId, startDate: chosen });
  return { created: true };
}

/**
 * Begin again from a chosen date. The old programme and its logs are not deleted: they are retired
 * (active = false), and every screen only ever reads the active programme, so the member starts clean.
 */
export async function restartProgram(db: Db, userId: string, now = new Date(), startDate?: string): Promise<{ ok: true; startDate: string } | { ok: false; error: "invalid_date" }> {
  const today = await localToday(db, userId, now);
  const chosen = chooseStart(startDate, today);
  if (!chosen) return { ok: false, error: "invalid_date" };
  await db.transaction(async (tx) => {
    await tx.update(commitments).set({ active: false }).where(and(eq(commitments.userId, userId), eq(commitments.active, true)));
    await tx.insert(commitments).values({ userId, startDate: chosen });
  });
  return { ok: true, startDate: chosen };
}

export type RestartScope = { scope: "self" } | { scope: "all" } | { scope: "user"; userId: string };
export type AdminRestartResult = { ok: true; restarted: number; startDate: string | null } | { ok: false; error: "invalid_date" | "not_found" };

/**
 * Owner action. Restart the owner's own, everyone's, or one member's programme. Each target is restarted by
 * restartProgram (their own row set only) inside one transaction, so a bad date or a missing user changes nothing.
 * Removed (disabled) members are skipped by "all".
 */
export async function adminRestart(db: Db, actorId: string, target: RestartScope, now = new Date(), startDate?: string): Promise<AdminRestartResult> {
  class Abort extends Error {
    constructor(readonly error: "invalid_date" | "not_found") {
      super(error);
    }
  }
  try {
    return await db.transaction(async (tx) => {
    let ids: string[];
    if (target.scope === "self") ids = [actorId];
    else if (target.scope === "user") {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, target.userId)).limit(1);
      if (!u) throw new Abort("not_found");
      ids = [u.id];
    } else ids = (await tx.select({ id: users.id }).from(users).where(eq(users.disabled, false))).map((u) => u.id);

    let chosen: string | null = null;
    for (const id of ids) {
      const r = await restartProgram(tx as unknown as Db, id, now, startDate);
      if (!r.ok) throw new Abort(r.error);
      chosen ??= r.startDate;
    }
    await audit(tx, actorId, `challenge.restart.${target.scope}`, target.scope === "user" ? target.userId : undefined);
    return { ok: true as const, restarted: ids.length, startDate: chosen };
    });
  } catch (e) {
    if (e instanceof Abort) return { ok: false, error: e.error };
    throw e;
  }
}

/**
 * The fresh start for everyone. Until COHORT_GRACE_DAYS after COHORT_START a member with no programme is offered
 * this instead of a free date: Day 1 is COHORT_START for the whole circle. Idempotent.
 */
export async function joinCohort(db: Db, userId: string, now = new Date()): Promise<{ created: boolean } | { error: "closed" }> {
  return db.transaction(async (tx) => {
    // Lock the member's row so two parallel requests cannot both pass the check below and create two active programmes.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [existing] = await tx.select({ id: commitments.id }).from(commitments).where(and(eq(commitments.userId, userId), eq(commitments.active, true))).limit(1);
    if (existing) return { created: false };
    // The window is enforced here, not only by the Today screen: after it closes nobody can claim a backdated Day 1.
    if (!(await cohortOpen(tx as unknown as Db, userId, now)).open) return { error: "closed" as const };
    await tx.insert(commitments).values({ userId, startDate: COHORT_START });
    return { created: true };
  });
}

/** True while a member with no programme should be shown the circle-wide start instead of the free-date picker. */
export async function cohortOpen(db: Db, userId: string, now = new Date()): Promise<{ open: boolean; startDate: string; today: string }> {
  const today = await localToday(db, userId, now);
  return { open: today <= addDays(COHORT_START, COHORT_GRACE_DAYS), startDate: COHORT_START, today };
}

export type ProgrammeInfo = { startDate: string; totalDays: number; today: string; started: boolean; dayNumber: number | null; daysUntilStart: number };

/** The member's active programme in one glance (null when they have none). */
export async function getProgramme(db: Db, userId: string, now = new Date()): Promise<ProgrammeInfo | null> {
  const ctx = await context(db, userId, now);
  if (!ctx) return null;
  const { commitment, today } = ctx;
  const started = today >= commitment.startDate;
  return {
    startDate: commitment.startDate,
    totalDays: commitment.totalDays,
    today,
    started,
    dayNumber: started ? dayNumber(commitment.startDate, today) : null,
    daysUntilStart: started ? 0 : daysBetween(today, commitment.startDate),
  };
}
