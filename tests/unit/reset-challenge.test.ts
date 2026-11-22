import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetChallengeData } from "@/server/admin/reset-challenge";
import * as t from "@/server/db/schema";
import { saveDay, startProgram } from "@/server/tracker/service";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
const FRI = new Date("2026-11-20T06:00:00Z");
const count = async (table: string) => Number((await ctx.pg.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

beforeAll(async () => {
  ctx = await makeTestDb();
  for (const e of ["a", "b", "c"]) {
    const [u] = await ctx.db.insert(t.users).values({ email: `${e}@example.com`, name: e, emailVerified: new Date(), passwordHash: "x" }).returning({ id: t.users.id });
    await ctx.db.insert(t.profiles).values({ userId: u.id });
    await ctx.db.insert(t.bodyMetrics).values({ userId: u.id, weightKg: "70" });
    await startProgram(db(), u.id, FRI);
    await saveDay(db(), u.id, "2026-11-20", { runKm: 5 }, FRI);
  }
  await ctx.db.update(t.commitments).set({ active: false }); // some retired programmes too
});
afterAll(() => ctx.close());

describe("reset of challenge data", () => {
  it("a dry run reports and changes nothing", async () => {
    const r = await resetChallengeData(db(), { apply: false });
    expect(r).toMatchObject({ applied: false, challengeBefore: { commitments: 3, dailyLogs: 3 } });
    expect(await count("commitments")).toBe(3);
    expect(await count("daily_logs")).toBe(3);
  });

  it("applying removes every programme and log (retired ones too) and nothing else", async () => {
    const r = await resetChallengeData(db(), { apply: true });
    expect(r).toMatchObject({ applied: true, challengeAfter: { commitments: 0, dailyLogs: 0 } });
    expect(await count("commitments")).toBe(0);
    expect(await count("daily_logs")).toBe(0);
    expect(await count("users")).toBe(3);
    expect(await count("profiles")).toBe(3);
    expect(await count("body_metrics")).toBe(3);
    const login = await ctx.pg.query("SELECT count(*) AS n FROM users WHERE password_hash IS NOT NULL");
    expect(Number((login.rows[0] as { n: string }).n)).toBe(3); // sign-in data kept
  });

  it("is repeatable, and members can start fresh afterwards", async () => {
    expect(await resetChallengeData(db(), { apply: true })).toMatchObject({ applied: true, challengeBefore: { commitments: 0, dailyLogs: 0 } });
    const [u] = await ctx.db.select({ id: t.users.id }).from(t.users).limit(1);
    expect(await startProgram(db(), u.id, FRI)).toEqual({ created: true });
  });
});
