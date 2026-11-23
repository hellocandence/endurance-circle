import { daysBetween, isSunday } from "./dates";

export const TASK_KEYS = ["RUN", "WARM_PRE", "WARM_POST", "STRETCH", "WATER", "ELECTRO", "PROTEIN", "STUDY", "TECH", "GITHUB", "SATSANG"] as const;
export type TaskKey = (typeof TASK_KEYS)[number];

export const TASK_LABELS: Record<TaskKey, string> = {
  RUN: "Run",
  WARM_PRE: "Warm-up",
  WARM_POST: "Cool-down",
  STRETCH: "Stretch",
  WATER: "Water",
  ELECTRO: "Electrolytes",
  PROTEIN: "Protein",
  STUDY: "Study",
  TECH: "Tech tip",
  GITHUB: "GitHub",
  SATSANG: "Reading",
};

/** What a member logged for one day (the daily_logs fields the rules read). */
export type DayInput = {
  runKm: number;
  warmupPreDone: boolean;
  warmupPostDone: boolean;
  stretchMin: number;
  waterL: number;
  electrolytesDone: boolean;
  proteinG: number;
  studyMin: number;
  techNote: string | null;
  githubContribution: boolean;
  readingMin: number;
};

/** The member's own targets (body_metrics). Defaults match the table defaults. */
export type TrackerConfig = {
  runTargetKm: number;
  waterTargetL: number;
  studyMinTarget: number; // 60 to 90
  weightKg: number | null;
  proteinMultiplier: number;
};

export const DEFAULT_CONFIG: TrackerConfig = { runTargetKm: 5, waterTargetL: 3, studyMinTarget: 60, weightKg: null, proteinMultiplier: 1.2 };

export const STRETCH_MIN_MINUTES = 20; // PRD: 20 to 30 minutes

/** Protein target in grams = round(weight × multiplier) (docs/04 §6). Null until a weight is set. */
export function proteinTarget(weightKg: number | null, multiplier = 1.2): number | null {
  return weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0 ? null : Math.round(weightKg * multiplier);
}

/** Required tasks: Sunday swaps RUN and both warm-ups for STRETCH (BR5). */
export function requiredTasks(sunday: boolean): TaskKey[] {
  const common: TaskKey[] = ["WATER", "ELECTRO", "PROTEIN", "STUDY", "TECH", "GITHUB", "SATSANG"];
  return sunday ? ["STRETCH", ...common] : ["RUN", "WARM_PRE", "WARM_POST", ...common];
}

/** Is each individual task satisfied by this day's log? (Independent of whether it is required.) */
export function taskStatus(input: DayInput, config: TrackerConfig = DEFAULT_CONFIG): Record<TaskKey, boolean> {
  const protein = proteinTarget(config.weightKg, config.proteinMultiplier);
  return {
    RUN: input.runKm >= config.runTargetKm,
    WARM_PRE: input.warmupPreDone,
    WARM_POST: input.warmupPostDone,
    STRETCH: input.stretchMin >= STRETCH_MIN_MINUTES,
    WATER: input.waterL >= config.waterTargetL,
    ELECTRO: input.electrolytesDone,
    // No weight yet → no target to compare with: any logged protein counts, and the UI asks for a weight.
    PROTEIN: protein === null ? input.proteinG > 0 : input.proteinG >= protein,
    STUDY: input.studyMin >= config.studyMinTarget,
    TECH: (input.techNote ?? "").trim().length > 0,
    GITHUB: input.githubContribution,
    SATSANG: input.readingMin > 0,
  };
}

/**
 * Credit per task: 1 when the target is met, PARTIAL_CREDIT when something was logged but the target is not met
 * (only tasks with a numeric target can be partial), otherwise 0. Every required task has the same weight, so a
 * partial task earns half of its share of the day (e.g. a 10% task earns 5%).
 */
export const PARTIAL_CREDIT = 0.5;

export function taskCredit(input: DayInput, config: TrackerConfig = DEFAULT_CONFIG): Record<TaskKey, number> {
  const status = taskStatus(input, config);
  const protein = proteinTarget(config.weightKg, config.proteinMultiplier);
  const logged: Record<TaskKey, boolean> = {
    RUN: input.runKm > 0,
    WARM_PRE: false,
    WARM_POST: false,
    STRETCH: input.stretchMin > 0,
    WATER: input.waterL > 0,
    ELECTRO: false,
    PROTEIN: protein !== null && input.proteinG > 0,
    STUDY: input.studyMin > 0,
    TECH: false,
    GITHUB: false,
    SATSANG: false,
  };
  const out = {} as Record<TaskKey, number>;
  for (const k of TASK_KEYS) out[k] = status[k] ? 1 : logged[k] ? PARTIAL_CREDIT : 0;
  return out;
}

export type DayResult = {
  required: TaskKey[];
  done: TaskKey[]; // required tasks that are ticked
  pending: TaskKey[]; // required tasks not yet ticked
  missed: TaskKey[]; // pending tasks once the day is over; empty while the day is still running
  partial: TaskKey[]; // required tasks below target but started (they earn half credit; still pending)
  percent: number; // weighted progress of the day, 0 to 100
  completed: boolean;
  doneCount: number;
  requiredCount: number;
};

/**
 * Evaluate one day. A day is complete when every required task is done. Unticked tasks only count as
 * "missed" after the day has ended (BR4): they are logged, they never reset the day count.
 */
export function evaluateDay(input: DayInput, opts: { date: string; dayOver: boolean; config?: TrackerConfig }): DayResult {
  const required = requiredTasks(isSunday(opts.date));
  const status = taskStatus(input, opts.config ?? DEFAULT_CONFIG);
  const done = required.filter((k) => status[k]);
  const pending = required.filter((k) => !status[k]);
  const credit = taskCredit(input, opts.config ?? DEFAULT_CONFIG);
  const partial = pending.filter((k) => credit[k] > 0);
  const percent = (required.reduce((sum, k) => sum + credit[k], 0) / required.length) * 100;
  return {
    required,
    done,
    pending,
    missed: opts.dayOver ? pending : [],
    partial,
    percent,
    completed: pending.length === 0,
    doneCount: done.length,
    requiredCount: required.length,
  };
}

/** Day 1 is the start date. Never resets and never stops counting (BR4). Null before the start date. */
export function dayNumber(startDate: string, logDate: string): number | null {
  const n = daysBetween(startDate, logDate) + 1;
  return n >= 1 ? n : null;
}

/** True once the member has reached the last day of the program (PRD: Day 75 celebration). */
export const reachedFinalDay = (day: number | null, totalDays = 75) => day !== null && day >= totalDays;
