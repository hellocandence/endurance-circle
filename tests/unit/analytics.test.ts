import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDaySeries, getMemberAnalytics, getMyStats, getProgressOverview, weeklyBars } from "@/server/dashboard/analytics";
import * as t from "@/server/db/schema";
import { saveDay } from "@/server/tracker/service";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
const NOW = new Date("2026-11-23T04:30:00Z"); // Mon 10:00 IST, day 3 of the programmes below
const SECRET_NOTE = "SECRET-PRIVATE-NOTE-77c";
const full = { runKm: 5, warmupPreDone: true, warmupPostDone: true, waterL: 3, electrolytesDone: true, proteinG: 130, studyMin: 60, techNote: "tip", githubContribution: true, readingMin: 5 };
let ids: Record<string, string>;

beforeAll(async () => {
  ctx = await makeTestDb();
  const rows = await ctx.db
    .insert(t.users)
    .values([
      { email: "alice@example.com", name: "Alice", emailVerified: new Date() },
      { email: "bob@example.com", name: "Bob", emailVerified: new Date() },
      { email: "gone@example.com", name: "Gone", emailVerified: new Date(), disabled: true },
      { email: "pending@example.com", name: "Pending" }, // never confirmed their email
    ])
    .returning({ id: t.users.id, email: t.users.email });
  ids = Object.fromEntries(rows.map((r) => [r.email.split("@")[0], r.id]));
  await ctx.db.insert(t.bodyMetrics).values([{ userId: ids.alice, weightKg: "71.37", heightCm: "171.9" }, { userId: ids.bob, weightKg: "99.99" }]);
  await ctx.db.insert(t.commitments).values([
    { userId: ids.alice, startDate: "2026-11-21" },
    { userId: ids.bob, startDate: "2026-11-21" },
    { userId: ids.gone, startDate: "2026-11-21" },
    { userId: ids.pending, startDate: "2026-11-21" },
  ]);
  await saveDay(db(), ids.alice, "2026-11-21", full, new Date("2026-11-21T04:30:00Z"));
  await saveDay(db(), ids.alice, "2026-11-22", { ...full, runKm: 0, warmupPreDone: false, warmupPostDone: false, stretchMin: 25 }, new Date("2026-11-22T04:30:00Z"));
  await saveDay(db(), ids.alice, "2026-11-23", { runKm: 5, waterL: 3, updateText: "Day 3 and feeling good", privateNotes: SECRET_NOTE }, NOW);
  await saveDay(db(), ids.bob, "2026-11-23", { updateText: "Rest of the plan tomorrow", privateNotes: "bob private" }, NOW);
});
afterAll(() => ctx.close());

describe("buildDaySeries and weeklyBars", () => {
  const logs = [
    { logDate: "2026-11-21", completed: true, doneCount: 10, requiredCount: 10 },
    { logDate: "2026-11-22", completed: false, doneCount: 4, requiredCount: 8 },
  ];
  it("marks done, missed, today and upcoming days", () => {
    const cells = buildDaySeries({ startDate: "2026-11-21", totalDays: 75, today: "2026-11-24", logs });
    expect(cells).toHaveLength(75);
    expect(cells.slice(0, 5).map((c) => c.state)).toEqual(["done", "missed", "missed", "today", "future"]);
    expect(cells[1]).toMatchObject({ done: 4, required: 8 });
    expect(cells[2].required).toBe(10); // no row: the day's default required count (Mon)
  });
  it("groups into 7-day weeks, the last one shorter, with no percentage before a week has finished days", () => {
    const cells = buildDaySeries({ startDate: "2026-11-21", totalDays: 75, today: "2026-11-24", logs });
    const weeks = weeklyBars(cells);
    expect(weeks).toHaveLength(11);
    expect(weeks[0]).toMatchObject({ week: 1, completed: 1, elapsed: 3, pct: 33 });
    expect(weeks[1].pct).toBeNull();
    expect(weeks.at(-1)).toMatchObject({ week: 11, elapsed: 0 });
  });
});

describe("getMemberAnalytics", () => {
  it("builds the day-by-day series and stats from public counts", async () => {
    const a = (await getMemberAnalytics(db(), ids.alice, NOW))!;
    expect(a).toMatchObject({ name: "Alice", dayNumber: 3 });
    expect(a.cells.slice(0, 4).map((c) => c.state)).toEqual(["done", "done", "today", "future"]);
    expect(a.stats).toMatchObject({ completionPct: 73, completedDays: 2, elapsedDays: 3, streak: 2, longestRun: 2, daysLeft: 72 });
    expect(a.weeks[0]).toMatchObject({ completed: 2, elapsed: 2, pct: 100 });
    expect(a.updates).toEqual([{ date: "2026-11-23", text: "Day 3 and feeling good" }]);
  });

  it("never carries private notes, body metrics or task amounts", async () => {
    const json = JSON.stringify(await getMemberAnalytics(db(), ids.alice, NOW));
    expect(json).not.toContain(SECRET_NOTE);
    expect(json).not.toMatch(/71\.37|171\.9|weight|runKm|proteinG|privateNotes|email/i);
  });

  it("returns nothing for disabled, unconfirmed or unknown members", async () => {
    expect(await getMemberAnalytics(db(), ids.gone, NOW)).toBeNull();
    expect(await getMemberAnalytics(db(), ids.pending, NOW)).toBeNull();
    expect(await getMemberAnalytics(db(), "00000000-0000-0000-0000-000000000000", NOW)).toBeNull();
  });
});

describe("getProgressOverview", () => {
  it("lists enabled, confirmed members with a streak and a recent strip", async () => {
    const { rows } = await getProgressOverview(db(), NOW);
    expect(rows.map((r) => r.displayName).sort()).toEqual(["Alice", "Bob"]);
    const alice = rows.find((r) => r.id === ids.alice)!;
    expect(alice).toMatchObject({ streak: 2, dayNumber: 3 });
    expect(alice.recent).toEqual(["done", "done", "today"]);
  });

  it("shows how much of the circle finished each of the last days, ending yesterday", async () => {
    const { trend } = await getProgressOverview(db(), NOW);
    expect(trend).toHaveLength(14);
    expect(trend.at(-1)).toMatchObject({ date: "2026-11-22", enrolled: 2, completed: 1, pct: 50 });
    expect(trend.at(-2)).toMatchObject({ date: "2026-11-21", pct: 50 });
    expect(trend[0].pct).toBeNull(); // before anyone started
  });
});

describe("getMyStats", () => {
  it("counts each task on the days it was required, against the member's own targets", async () => {
    const mine = (await getMyStats(db(), ids.alice, NOW))!;
    const task = (k: string) => mine.tasks.find((x) => x.key === k)!;
    expect(task("RUN")).toMatchObject({ done: 1, required: 1, pct: 100 }); // Sunday has no run
    expect(task("STRETCH")).toMatchObject({ done: 1, required: 1 });
    expect(task("WATER")).toMatchObject({ done: 2, required: 2 }); // the unfinished Monday is not counted
    expect(mine.totals).toMatchObject({ runKm: 10, studyHours: 2, loggedDays: 3 });
  });
  it("is null without a programme", async () => {
    expect(await getMyStats(db(), "00000000-0000-0000-0000-000000000000", NOW)).toBeNull();
  });
});

describe("activity log", () => {
  it("lists each day newest first with the ticked tasks and the public update line", async () => {
    const a = (await getMemberAnalytics(db(), ids.alice, NOW))!;
    expect(a.log.map((d) => d.dayNumber)).toEqual([3, 2, 1]);
    expect(a.log[0]).toMatchObject({ date: "2026-11-23", state: "today", updateText: "Day 3 and feeling good" });
    expect(a.log[0].tasks.filter((t) => t.done).length).toBe(a.log[0].done);
    expect(a.log[2]).toMatchObject({ state: "done", done: 10, required: 10 });
    expect(JSON.stringify(a.log)).not.toContain(SECRET_NOTE);
  });
});
