// Privacy projections (docs/04-RBAC-DATA-MODEL.md §5). Each builds its result field by field from an
// allowlist; none spreads a row, so a column added to the database later is never exposed by accident.
import { can, type Actor } from "@/server/rbac/can";
import { ForbiddenError } from "@/server/rbac/errors";

const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** What every member may see about another member. No body metrics, no private notes, ever. */
export type PublicMember = {
  id: string;
  displayName: string;
  avatarUrl: string | null; // 128 px version only
  todayDone: number;
  todayTotal: number;
  dayNumber: number | null;
  streak: number;
  updateText: string | null;
  commitmentPct: number;
};

type PublicMemberInput = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  todayDone?: number;
  todayTotal?: number;
  dayNumber?: number | null;
  streak?: number;
  updateText?: string | null;
  commitmentPct?: number;
  // Anything else on the object (weight, limits, private notes, ...) is ignored by design.
};

export function publicMember(m: PublicMemberInput): PublicMember {
  return {
    id: m.id,
    displayName: m.name,
    avatarUrl: m.avatarUrl ?? null,
    todayDone: m.todayDone ?? 0,
    todayTotal: m.todayTotal ?? 0,
    dayNumber: m.dayNumber ?? null,
    streak: m.streak ?? 0,
    updateText: m.updateText ?? null,
    commitmentPct: m.commitmentPct ?? 0,
  };
}

export type DailyLogRow = {
  id: string;
  logDate: string;
  dayNumber: number;
  isSunday: boolean;
  runKm: string | number;
  warmupPreDone: boolean;
  warmupPostDone: boolean;
  stretchMin: number;
  waterL: string | number;
  electrolytesDone: boolean;
  proteinG: number;
  studyMin: number;
  studyTopic: string | null;
  techNote: string | null;
  githubContribution: boolean;
  readingMin: number;
  readingTitle: string | null;
  updateText: string | null;
  privateNotes: string | null;
  completed: boolean;
  missedTasks: string[];
};

/** A member's own journey (all log fields, including private notes). Owner and the member only. */
export function privateJourney(actor: Actor, ownerId: string, logs: DailyLogRow[]) {
  if (!can(actor, "read", { kind: "journey", ownerId })) throw new ForbiddenError();
  return {
    ownerId,
    logs: logs.map((l) => ({
      id: l.id,
      logDate: l.logDate,
      dayNumber: l.dayNumber,
      isSunday: l.isSunday,
      runKm: num(l.runKm) ?? 0,
      warmupPreDone: l.warmupPreDone,
      warmupPostDone: l.warmupPostDone,
      stretchMin: l.stretchMin,
      waterL: num(l.waterL) ?? 0,
      electrolytesDone: l.electrolytesDone,
      proteinG: l.proteinG,
      studyMin: l.studyMin,
      studyTopic: l.studyTopic,
      techNote: l.techNote,
      githubContribution: l.githubContribution,
      readingMin: l.readingMin,
      readingTitle: l.readingTitle,
      updateText: l.updateText,
      privateNotes: l.privateNotes,
      completed: l.completed,
      missedTasks: [...l.missedTasks],
    })),
  };
}

export type BodyMetricsRow = {
  userId: string;
  weightKg: string | number | null;
  heightCm: string | number | null;
  proteinMultiplier: string | number;
  waterTargetL: string | number;
  runTargetKm: string | number;
  studyMinTarget: number;
};

/** Body metrics: only the member and the owner (BR3). Throws ForbiddenError for anyone else. */
export function bodyMetrics(actor: Actor, ownerId: string, row: BodyMetricsRow) {
  if (!can(actor, "read", { kind: "body", ownerId })) throw new ForbiddenError();
  const weightKg = num(row.weightKg);
  const proteinMultiplier = num(row.proteinMultiplier) ?? 1.2;
  return {
    userId: row.userId,
    weightKg,
    heightCm: num(row.heightCm),
    proteinMultiplier,
    waterTargetL: num(row.waterTargetL) ?? 3,
    runTargetKm: num(row.runTargetKm) ?? 5,
    studyMinTarget: row.studyMinTarget,
    // Derived value (docs/04 §6): protein target = round(weight × multiplier)
    proteinTargetG: weightKg === null ? null : Math.round(weightKg * proteinMultiplier),
  };
}
