import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bodyPatchSchema, getBodyRow, updateBody } from "@/server/body/service";
import * as t from "@/server/db/schema";
import { bodyMetrics } from "@/server/privacy";
import { getToday, saveDay } from "@/server/tracker/service";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
let aliceId: string;
const NOW = new Date("2026-11-23T04:30:00Z"); // Mon 10:00 IST
const full = { runKm: 5, warmupPreDone: true, warmupPostDone: true, waterL: 3, electrolytesDone: true, proteinG: 100, studyMin: 60, techNote: "tip", githubContribution: true, readingMin: 5 };

beforeAll(async () => {
  ctx = await makeTestDb();
  [{ id: aliceId }] = await ctx.db.insert(t.users).values({ email: "alice@example.com", name: "Alice" }).returning({ id: t.users.id });
  await ctx.db.insert(t.bodyMetrics).values({ userId: aliceId, weightKg: "70" });
  await ctx.db.insert(t.commitments).values({ userId: aliceId, startDate: "2026-11-20" });
});
afterAll(() => ctx.close());

describe("bodyPatchSchema", () => {
  it("accepts valid values and rounds to the column scale", () => {
    expect(bodyPatchSchema.parse({ weightKg: 70.456, heightCm: 172.04, proteinMultiplier: 1.234, waterTargetL: 3.04, runTargetKm: 5.55 })).toEqual({
      weightKg: 70.46, heightCm: 172, proteinMultiplier: 1.23, waterTargetL: 3, runTargetKm: 5.5,
    });
    expect(bodyPatchSchema.parse({ weightKg: null })).toEqual({ weightKg: null });
  });
  it("study target must be a whole number of minutes from 60 to 90", () => {
    for (const ok of [60, 75, 90]) expect(bodyPatchSchema.safeParse({ studyMinTarget: ok }).success).toBe(true);
    for (const bad of [59, 91, 75.5, "75", null]) expect(bodyPatchSchema.safeParse({ studyMinTarget: bad }).success, String(bad)).toBe(false);
  });
  it("rejects out-of-range and foreign fields", () => {
    for (const bad of [{ weightKg: 5 }, { weightKg: 500 }, { heightCm: 20 }, { proteinMultiplier: 0 }, { waterTargetL: 11 }, { runTargetKm: 0 }, { userId: "x" }, { role: "OWNER" }]) {
      expect(bodyPatchSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("updateBody", () => {
  it("protein target recalculates from weight (70 kg × 1.2 = 84; 80 kg × 1.2 = 96; × 1.5 = 120)", async () => {
    const actor = { id: aliceId, role: "MEMBER" as const };
    expect(bodyMetrics(actor, aliceId, (await getBodyRow(db(), aliceId))!).proteinTargetG).toBe(84);
    expect(bodyMetrics(actor, aliceId, (await updateBody(db(), aliceId, { weightKg: 80 }, NOW))!).proteinTargetG).toBe(96);
    expect(bodyMetrics(actor, aliceId, (await updateBody(db(), aliceId, { proteinMultiplier: 1.5 }, NOW))!).proteinTargetG).toBe(120);
    await updateBody(db(), aliceId, { weightKg: 70, proteinMultiplier: 1.2 }, NOW);
  });

  it("changing a target recomputes today's stored result (the circle feed reads it)", async () => {
    await saveDay(db(), aliceId, "2026-11-23", full, NOW);
    let today = await getToday(db(), aliceId, NOW);
    expect(today.ok && today.data.evaluation.completed).toBe(true);
    const [before] = await ctx.db.select().from(t.dailyLogs).where(eq(t.dailyLogs.logDate, "2026-11-23"));
    expect(before).toMatchObject({ completed: true, doneCount: 10, requiredCount: 10 });

    await updateBody(db(), aliceId, { runTargetKm: 8 }, NOW); // the 5 km run no longer counts
    const [after] = await ctx.db.select().from(t.dailyLogs).where(eq(t.dailyLogs.logDate, "2026-11-23"));
    expect(after).toMatchObject({ completed: false, doneCount: 9, requiredCount: 10 });
    today = await getToday(db(), aliceId, NOW);
    expect(today.ok && today.data.evaluation.pending).toEqual(["RUN"]);
  });

  it("the study target sets the bar (90 min needed once raised)", async () => {
    await updateBody(db(), aliceId, { runTargetKm: 5, studyMinTarget: 90 }, NOW);
    const t1 = await getToday(db(), aliceId, NOW);
    expect(t1.ok && t1.data.evaluation.pending).toEqual(["STUDY"]);
  });

  it("only touches the given fields and the right user", async () => {
    const [other] = await ctx.db.insert(t.users).values({ email: "o@example.com", name: "O" }).returning({ id: t.users.id });
    await ctx.db.insert(t.bodyMetrics).values({ userId: other.id, weightKg: "99" });
    await updateBody(db(), aliceId, { waterTargetL: 4 }, NOW);
    expect(await getBodyRow(db(), other.id)).toMatchObject({ weightKg: "99.00", waterTargetL: "3.0" });
    expect(await getBodyRow(db(), aliceId)).toMatchObject({ waterTargetL: "4.0", weightKg: "70.00" });
  });

  it("creates the row if it is missing and returns null for unknown users", async () => {
    const [u] = await ctx.db.insert(t.users).values({ email: "new@example.com", name: "N" }).returning({ id: t.users.id });
    expect(await updateBody(db(), u.id, { weightKg: 65 }, NOW)).toMatchObject({ weightKg: "65.00" });
    expect(await updateBody(db(), "00000000-0000-4000-8000-000000000000", { weightKg: 65 }, NOW)).toBeNull();
  });
});
