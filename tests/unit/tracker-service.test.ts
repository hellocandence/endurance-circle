import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as t from "@/server/db/schema";
import { dayPatchSchema } from "@/server/tracker/schema";
import { getJourneyRows } from "@/server/tracker/journey";
import { getToday, saveDay } from "@/server/tracker/service";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
let aliceId: string;
let bobId: string;
let noProgramId: string;

// Alice starts on Fri 2026-11-20 (Asia/Kolkata). "now" below is 10:00 IST on that date.
const at = (iso: string) => new Date(iso);
const FRI_NOW = at("2026-11-20T04:30:00Z"); // 10:00 IST Fri
const SAT_NOW = at("2026-11-21T04:30:00Z");
const SUN_NOW = at("2026-11-22T04:30:00Z");
const MON_NOW = at("2026-11-23T04:30:00Z");

const fullDay = {
  runKm: 5.2, warmupPreDone: true, warmupPostDone: true, waterL: 3, electrolytesDone: true, proteinG: 84,
  studyMin: 60, techNote: "tip", githubContribution: true, readingMin: 10,
};

beforeAll(async () => {
  ctx = await makeTestDb();
  const [a, b, c] = await ctx.db.insert(t.users).values([
    { email: "alice@example.com", name: "Alice" },
    { email: "bob@example.com", name: "Bob" },
    { email: "nobody@example.com", name: "NoProgram" },
  ]).returning({ id: t.users.id });
  [aliceId, bobId, noProgramId] = [a.id, b.id, c.id];
  await ctx.db.insert(t.bodyMetrics).values([{ userId: aliceId, weightKg: "70" }, { userId: bobId }]);
  await ctx.db.insert(t.commitments).values([
    { userId: aliceId, startDate: "2026-11-20" },
    { userId: bobId, startDate: "2026-11-20" },
  ]);
});
afterAll(() => ctx.close());

const rows = (userId: string) => ctx.db.select().from(t.dailyLogs).where(eq(t.dailyLogs.userId, userId));

describe("getToday", () => {
  it("returns the member's own day without writing anything", async () => {
    const r = await getToday(db(), aliceId, FRI_NOW);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data).toMatchObject({ date: "2026-11-20", isToday: true, isSunday: false, dayNumber: 1, totalDays: 75, proteinTargetG: 84, row: null });
    expect(r.data.evaluation).toMatchObject({ completed: false, doneCount: 0, requiredCount: 10, missed: [] });
    expect(await rows(aliceId)).toHaveLength(0);
  });

  it("reports no program when there is no active commitment", async () => {
    expect(await getToday(db(), noProgramId, FRI_NOW)).toEqual({ ok: false, error: "no_active_commitment" });
  });

  it("uses the member's local date (time zone day boundary)", async () => {
    const r = await getToday(db(), aliceId, at("2026-11-20T20:00:00Z")); // already Saturday in Kolkata
    expect(r.ok && r.data.date).toBe("2026-11-21");
  });
});

describe("saveDay", () => {
  it("PUT updates completion and stores the log", async () => {
    const r = await saveDay(db(), aliceId, "2026-11-20", fullDay, FRI_NOW);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.evaluation).toMatchObject({ completed: true, doneCount: 10, pending: [] });
    const [row] = await rows(aliceId);
    expect(row).toMatchObject({ logDate: "2026-11-20", dayNumber: 1, isSunday: false, completed: true, missedTasks: [] });
    expect(Number(row.runKm)).toBe(5.2);
  });

  it("is an upsert: saving again keeps one row per date", async () => {
    await saveDay(db(), aliceId, "2026-11-20", { updateText: "Day 1 done" }, FRI_NOW);
    await saveDay(db(), aliceId, "2026-11-20", { updateText: "Day 1 done!" }, FRI_NOW);
    const all = await rows(aliceId);
    expect(all.filter((r) => r.logDate === "2026-11-20")).toHaveLength(1);
    expect(all[0].updateText).toBe("Day 1 done!");
  });

  it("merges partial updates and recomputes completion from the merged result", async () => {
    await saveDay(db(), aliceId, "2026-11-21", { runKm: 6, warmupPreDone: true }, SAT_NOW);
    const r = await saveDay(db(), aliceId, "2026-11-21", { warmupPostDone: true, waterL: 3.5 }, SAT_NOW);
    if (!r.ok) throw new Error("expected ok");
    const [row] = (await rows(aliceId)).filter((x) => x.logDate === "2026-11-21");
    expect(Number(row.runKm)).toBe(6); // kept from the first request
    expect(row.warmupPostDone).toBe(true);
    expect(r.data.evaluation.done).toEqual(expect.arrayContaining(["RUN", "WARM_PRE", "WARM_POST", "WATER"]));
    expect(r.data.evaluation.completed).toBe(false);
  });

  it("AT-10: a missed task is logged once the day is over, and the day count continues", async () => {
    // Saturday 2026-11-21 was left incomplete. It is locked on Sunday (T105), but its misses are still reported.
    const journey = await getJourneyRows(db(), aliceId, SUN_NOW);
    const sat = journey?.rows.find((x) => x.logDate === "2026-11-21");
    expect(sat?.completed).toBe(false);
    expect(sat?.missedTasks).toEqual(expect.arrayContaining(["ELECTRO", "PROTEIN", "STUDY", "TECH", "GITHUB", "SATSANG"]));
    const view = await getToday(db(), aliceId, SUN_NOW);
    expect(view.ok && view.data.dayNumber).toBe(3);

    // today's own log is still open: it has no misses until the day ends
    expect(journey?.rows.find((x) => x.logDate === "2026-11-22")?.missedTasks ?? []).toEqual([]);
  });

  it("T105: a finished day is locked, only today can be edited", async () => {
    expect(await saveDay(db(), aliceId, "2026-11-21", { githubContribution: true }, SUN_NOW)).toEqual({ ok: false, error: "locked" }); // yesterday
    expect(await saveDay(db(), aliceId, "2026-11-22", { updateText: "still open" }, SUN_NOW)).toMatchObject({ ok: true }); // today
  });

  it("AT-09: Sunday needs stretching, not a run", async () => {
    const sunday = { ...fullDay, runKm: 0, warmupPreDone: false, warmupPostDone: false, stretchMin: 25 };
    const r = await saveDay(db(), aliceId, "2026-11-22", sunday, SUN_NOW);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data).toMatchObject({ isSunday: true, evaluation: { completed: true, requiredCount: 8 } });
    const [row] = (await rows(aliceId)).filter((x) => x.logDate === "2026-11-22");
    expect(row).toMatchObject({ isSunday: true, completed: true, dayNumber: 3 });
  });

  it("enforces the date window", async () => {
    expect(await saveDay(db(), aliceId, "2026-11-21", {}, FRI_NOW)).toEqual({ ok: false, error: "in_future" });
    expect(await saveDay(db(), aliceId, "2026-11-19", {}, FRI_NOW)).toEqual({ ok: false, error: "before_start" });
    expect(await saveDay(db(), aliceId, "2026-11-20", {}, MON_NOW)).toEqual({ ok: false, error: "locked" }); // 3 days ago
    expect(await saveDay(db(), aliceId, "2026-11-22", {}, MON_NOW)).toEqual({ ok: false, error: "locked" }); // yesterday (T105)
    expect(await saveDay(db(), aliceId, "2026-11-23", {}, MON_NOW)).toMatchObject({ ok: true }); // today
    for (const bad of ["tomorrow", "2026-02-30", "2026-11-20T10:00", "../etc"]) {
      expect(await saveDay(db(), aliceId, bad, {}, FRI_NOW)).toEqual({ ok: false, error: "invalid_date" });
    }
  });

  it("fails without an active commitment", async () => {
    expect(await saveDay(db(), noProgramId, "2026-11-20", {}, FRI_NOW)).toEqual({ ok: false, error: "no_active_commitment" });
  });

  it("only ever writes the caller's own row (no cross-user writes)", async () => {
    await saveDay(db(), bobId, "2026-11-20", { runKm: 1, privateNotes: "bob's secret" }, FRI_NOW);
    const [bobRow] = await rows(bobId);
    expect(bobRow.userId).toBe(bobId);
    const aliceFri = (await rows(aliceId)).find((x) => x.logDate === "2026-11-20")!;
    expect(aliceFri.privateNotes).toBeNull();
    expect(Number(aliceFri.runKm)).toBe(5.2);
  });

  it("stores private notes only against the caller and returns them to the caller", async () => {
    const r = await saveDay(db(), bobId, "2026-11-20", { privateNotes: "bob's secret" }, FRI_NOW);
    expect(r.ok && r.data.row?.privateNotes).toBe("bob's secret");
  });

  it("uses the member's own targets for protein (70 kg → 84 g; 83 g is not enough)", async () => {
    await saveDay(db(), aliceId, "2026-11-22", { proteinG: 83 }, SUN_NOW);
    const r = await getToday(db(), aliceId, SUN_NOW);
    expect(r.ok && r.data.evaluation.pending).toEqual(["PROTEIN"]);
  });

  it("one commitment row per day: unique key holds", async () => {
    const count = await ctx.db.select().from(t.dailyLogs).where(and(eq(t.dailyLogs.userId, aliceId), eq(t.dailyLogs.logDate, "2026-11-22")));
    expect(count).toHaveLength(1);
  });
});

describe("dayPatchSchema", () => {
  it("accepts a partial update", () => {
    expect(dayPatchSchema.safeParse({ runKm: 5.5, techNote: null }).success).toBe(true);
    expect(dayPatchSchema.safeParse({}).success).toBe(true);
  });

  it("rejects server-computed and foreign fields (mass assignment)", () => {
    for (const field of ["completed", "dayNumber", "isSunday", "missedTasks", "userId", "commitmentId", "id", "createdAt"]) {
      expect(dayPatchSchema.safeParse({ [field]: field === "missedTasks" ? [] : "x" }).success, field).toBe(false);
    }
  });

  it("rejects out-of-range and wrong-typed values", () => {
    const bad = [{ runKm: -1 }, { runKm: 101 }, { waterL: 21 }, { stretchMin: 1.5 }, { proteinG: -3 }, { studyMin: 601 }, { runKm: "5" }, { warmupPreDone: "yes" }, { updateText: "x".repeat(281) }, { privateNotes: "x".repeat(2001) }];
    for (const b of bad) expect(dayPatchSchema.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });

  it("trims text", () => {
    const r = dayPatchSchema.parse({ techNote: "  tip  " });
    expect(r.techNote).toBe("tip");
  });
});
