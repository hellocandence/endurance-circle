import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { bodyMetrics, dailyLogs } from "@/server/db/schema";
import type { BodyMetricsRow } from "@/server/privacy";
import { addDays, localDate } from "@/server/tracker";
import { saveDay } from "@/server/tracker/service";
import { users } from "@/server/db/schema";

/** Rounded to the column scale so the stored value is exactly what the member typed. */
const dec = (min: number, max: number, scale: number) =>
  z.number().min(min).max(max).transform((n) => Number(n.toFixed(scale)));

/**
 * Body limits a member may set. Strict: nothing else can be written through this endpoint.
 * Study minutes are 60 to 90 (PRD); the database enforces the same range.
 */
export const bodyPatchSchema = z
  .object({
    weightKg: dec(20, 400, 2).nullable(),
    heightCm: dec(80, 260, 1).nullable(),
    proteinMultiplier: dec(0.5, 3, 2),
    waterTargetL: dec(0.5, 10, 1),
    runTargetKm: dec(0.5, 50, 1),
    studyMinTarget: z.number().int().min(60).max(90),
  })
  .partial()
  .strict();

export type BodyPatch = z.infer<typeof bodyPatchSchema>;

export async function getBodyRow(db: Db, userId: string): Promise<BodyMetricsRow | null> {
  const [row] = await db.select().from(bodyMetrics).where(eq(bodyMetrics.userId, userId)).limit(1);
  return row ?? null;
}

const str = (n: number | null | undefined) => (n === undefined ? undefined : n === null ? null : String(n));

/**
 * Update the member's own limits. Targets decide what counts as "done", so today's and yesterday's stored
 * counts are recomputed afterwards (the circle feed reads those counts).
 */
export async function updateBody(db: Db, userId: string, patch: BodyPatch, now = new Date()): Promise<BodyMetricsRow | null> {
  const [user] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const set = Object.fromEntries(
    Object.entries({
      weightKg: str(patch.weightKg),
      heightCm: str(patch.heightCm),
      proteinMultiplier: str(patch.proteinMultiplier),
      waterTargetL: str(patch.waterTargetL),
      runTargetKm: str(patch.runTargetKm),
      studyMinTarget: patch.studyMinTarget,
    }).filter(([, v]) => v !== undefined),
  );
  await db.insert(bodyMetrics).values({ userId, ...set }).onConflictDoUpdate({ target: bodyMetrics.userId, set });

  const today = localDate(now, user.timeZone);
  for (const date of [today, addDays(today, -1)]) {
    const [existing] = await db.select({ id: dailyLogs.id }).from(dailyLogs).where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.logDate, date))).limit(1);
    if (existing) await saveDay(db, userId, date, {}, now); // empty patch: just recompute
  }
  return getBodyRow(db, userId);
}
