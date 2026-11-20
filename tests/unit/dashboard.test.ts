import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { circlePulse, getPublicDashboard } from "@/server/dashboard/public";
import { saveDay } from "@/server/tracker/service";
import * as t from "@/server/db/schema";
import type { PublicMember } from "@/server/privacy";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
const NOW = new Date("2026-11-23T04:30:00Z"); // Mon 10:00 IST
const SECRET_NOTE = "SECRET-PRIVATE-NOTE-9f3";
const full = { runKm: 5, warmupPreDone: true, warmupPostDone: true, waterL: 3, electrolytesDone: true, proteinG: 130, studyMin: 60, techNote: "tip", githubContribution: true, readingMin: 5 };
let ids: Record<string, string>;

beforeAll(async () => {
  ctx = await makeTestDb();
  const rows = await ctx.db.insert(t.users).values([
    { email: "alice@example.com", name: "Alice", emailVerified: new Date() },
    { email: "bob@example.com", name: "Bob", emailVerified: new Date() },
    { email: "gone@example.com", name: "Gone", emailVerified: new Date(), disabled: true },
    { email: "idle@example.com", name: "Idle", emailVerified: new Date() },
  ]).returning({ id: t.users.id, email: t.users.email });
  ids = Object.fromEntries(rows.map((r) => [r.email.split("@")[0], r.id]));
  await ctx.db.insert(t.bodyMetrics).values([
    { userId: ids.alice, weightKg: "71.37", heightCm: "171.9" },
    { userId: ids.bob, weightKg: "99.99" },
  ]);
  await ctx.db.insert(t.commitments).values([
    { userId: ids.alice, startDate: "2026-11-21" },
    { userId: ids.bob, startDate: "2026-11-21" },
    { userId: ids.gone, startDate: "2026-11-21" },
  ]);
  // Alice: Sat complete, Sun complete (stretch), Mon partial with a public line and a private note
  await saveDay(db(), ids.alice, "2026-11-21", full, new Date("2026-11-21T04:30:00Z"));
  await saveDay(db(), ids.alice, "2026-11-22", { ...full, runKm: 0, warmupPreDone: false, warmupPostDone: false, stretchMin: 25 }, new Date("2026-11-22T04:30:00Z"));
  await saveDay(db(), ids.alice, "2026-11-23", { runKm: 5, waterL: 3, updateText: "Day 3 and feeling good", privateNotes: SECRET_NOTE }, NOW);
  await saveDay(db(), ids.bob, "2026-11-23", { updateText: "Rest of the plan tomorrow", privateNotes: "bob private" }, NOW);
});
afterAll(() => ctx.close());

describe("getPublicDashboard", () => {
  it("lists enabled members only, as public cards", async () => {
    const { members } = await getPublicDashboard(db(), NOW);
    expect(members.map((m) => m.displayName)).toEqual(["Alice", "Bob", "Idle"]); // "Gone" is disabled
  });

  it("shows which of today's tasks each member has ticked, as names only", async () => {
    const { members, pulse } = await getPublicDashboard(db(), NOW);
    const alice = members.find((m) => m.id === ids.alice)!;
    expect(alice.doneTasks).toEqual(["RUN", "WATER"]);
    expect(alice.requiredTasks).toHaveLength(10);
    expect(pulse.activity.find((a) => a.key === "RUN")?.done.map((d) => d.name)).toEqual(["Alice"]);
  });

  it("computes today's count, day number, streak, update line and completion %", async () => {
    const { members } = await getPublicDashboard(db(), NOW);
    const alice = members.find((m) => m.id === ids.alice)!;
    expect(alice).toMatchObject({ dayNumber: 3, todayDone: 2, todayTotal: 10, streak: 2, updateText: "Day 3 and feeling good", commitmentPct: 100 });
    const bob = members.find((m) => m.id === ids.bob)!;
    expect(bob).toMatchObject({ dayNumber: 3, todayDone: 0, streak: 0, commitmentPct: 0, updateText: "Rest of the plan tomorrow" });
  });

  it("a member with no programme still appears, with neutral numbers", async () => {
    const { members } = await getPublicDashboard(db(), NOW);
    expect(members.find((m) => m.id === ids.idle)).toMatchObject({ dayNumber: null, todayDone: 0, todayTotal: 10, commitmentPct: 0, streak: 0 });
  });

  it("AT-03: contains no body metrics, private notes, emails or other private fields", async () => {
    const out = await getPublicDashboard(db(), NOW);
    const json = JSON.stringify(out);
    for (const secret of [SECRET_NOTE, "bob private", "71.37", "171.9", "99.99", "alice@example.com", "bob@example.com", "argon2", "Asia/Kolkata"]) {
      expect(json).not.toContain(secret);
    }
    for (const key of [/weight/i, /height/i, /proteinG|proteinTarget|proteinMultiplier/i, /private/i, /notes?\b/i, /email/i, /password/i, /timeZone/i, /target/i]) {
      expect(json).not.toMatch(key);
    }
    for (const m of out.members) {
      expect(Object.keys(m).sort()).toEqual(["avatarUrl", "commitmentPct", "dayNumber", "displayName", "doneTasks", "id", "requiredTasks", "streak", "todayDone", "todayTotal", "updateText"]);
    }
  });

  it("uses each member's own local date for 'today'", async () => {
    // 20:00Z Monday is already Tuesday in Kolkata: Alice's Monday work is no longer "today"
    const { members } = await getPublicDashboard(db(), new Date("2026-11-23T20:00:00Z"));
    expect(members.find((m) => m.id === ids.alice)).toMatchObject({ dayNumber: 4, todayDone: 0 });
  });
});

describe("circlePulse", () => {
  const m = (over: Partial<PublicMember>): PublicMember => ({ id: "x", displayName: "X", avatarUrl: null, todayDone: 0, todayTotal: 10, dayNumber: 1, streak: 0, updateText: null, commitmentPct: 0, doneTasks: [], requiredTasks: [], ...over });
  it("summarises the circle from public cards only", () => {
    expect(circlePulse([m({ todayDone: 10, commitmentPct: 90 }), m({ todayDone: 4, commitmentPct: 60 }), m({ commitmentPct: 30 })])).toEqual({
      memberCount: 3, activeToday: 2, completedToday: 1, tasksDone: 14, tasksTotal: 30, averageCompletionPct: 60, activity: [],
    });
  });
  it("lists, task by task, who has done what today (names only)", () => {
    const req = ["RUN", "WATER"];
    const pulse = circlePulse([
      m({ id: "a", displayName: "Alice A", requiredTasks: req, doneTasks: ["RUN", "WATER"] }),
      m({ id: "b", displayName: "Bob B", requiredTasks: req, doneTasks: ["WATER"] }),
      m({ id: "c", displayName: "Cy C", requiredTasks: ["WATER"], doneTasks: [] }), // Sunday-style day: no run required
    ]);
    expect(pulse.activity).toEqual([
      { key: "RUN", label: "Run", total: 2, done: [{ id: "a", name: "Alice A" }] },
      { key: "WATER", label: "Water", total: 3, done: [{ id: "a", name: "Alice A" }, { id: "b", name: "Bob B" }] },
    ]);
  });
  it("handles an empty circle", () => {
    expect(circlePulse([])).toEqual({ memberCount: 0, activeToday: 0, completedToday: 0, tasksDone: 0, tasksTotal: 0, averageCompletionPct: 0, activity: [] });
  });
});

describe("getProgressList: hand-calculated fixture", () => {
  // Programme started 2026-11-10, today is 2026-11-20 (day 11, Asia/Kolkata morning).
  // Completed days 1,2,3,5,6,8,9,10 (Nov 10,11,12,14,15,17,18,19); days 4 and 7 missed; today unfinished.
  //   overall:  8 completed of 10 finished days = 80%
  //   last 7:   days 4..10 -> completed 5,6,8,9,10 = 5 of 7 = 71%
  it("matches the hand-calculated percentages", async () => {
    const { getProgressList } = await import("@/server/dashboard/public");
    const c = await makeTestDb();
    try {
      const [u] = await c.db.insert(t.users).values({ email: "fixture@example.com", name: "Fixture", emailVerified: new Date() }).returning({ id: t.users.id });
      const [prog] = await c.db.insert(t.commitments).values({ userId: u.id, startDate: "2026-11-10" }).returning({ id: t.commitments.id });
      const completedDates = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-14", "2026-11-15", "2026-11-17", "2026-11-18", "2026-11-19"];
      await c.db.insert(t.dailyLogs).values(
        completedDates.map((d) => ({ userId: u.id, commitmentId: prog.id, logDate: d, dayNumber: 1, isSunday: false, completed: true })),
      );
      const rows = await getProgressList(c.db as never, new Date("2026-11-20T04:30:00Z"));
      expect(rows).toEqual([
        { id: u.id, displayName: "Fixture", dayNumber: 11, window: { completed: 8, elapsed: 10, pct: 80 }, last7: { completed: 5, elapsed: 7, pct: 71 } },
      ]);
      expect(JSON.stringify(rows)).not.toMatch(/weight|private|email/i);
    } finally {
      await c.close();
    }
  });

  it("orders by overall completion, then name; members without a programme sit at 0%", async () => {
    const { getProgressList } = await import("@/server/dashboard/public");
    const rows = await getProgressList(db(), NOW);
    const pcts = rows.map((r) => r.window.pct);
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts);
    expect(rows.find((r) => r.displayName === "Idle")).toMatchObject({ dayNumber: null, window: { pct: 0 } });
  });
});
