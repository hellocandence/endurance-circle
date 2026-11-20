import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as t from "@/server/db/schema";
import { getJourneyRows } from "@/server/tracker/journey";
import { getProgramme, getToday, restartProgram, saveDay, startProgram } from "@/server/tracker/service";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
const FRI = new Date("2026-11-20T06:00:00Z"); // Fri 11:30 in Kolkata
const MON = "2026-11-23";
let n = 0;
async function member() {
  const [u] = await ctx.db.insert(t.users).values({ email: `c${++n}@example.com`, name: "C", emailVerified: new Date() }).returning({ id: t.users.id });
  await ctx.db.insert(t.bodyMetrics).values({ userId: u.id, weightKg: "70" });
  return u.id;
}
const rows = (id: string) => ctx.db.select().from(t.commitments).where(eq(t.commitments.userId, id));

beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(() => ctx.close());

describe("starting on a chosen date", () => {
  it("defaults to the member's today", async () => {
    const id = await member();
    expect(await startProgram(db(), id, FRI)).toEqual({ created: true });
    expect((await rows(id))[0].startDate).toBe("2026-11-20");
  });

  it("accepts a later date up to 60 days ahead", async () => {
    const a = await member();
    expect(await startProgram(db(), a, FRI, MON)).toEqual({ created: true });
    expect((await rows(a))[0].startDate).toBe(MON);
    const b = await member();
    expect(await startProgram(db(), b, FRI, "2027-01-19")).toEqual({ created: true }); // exactly 60 days ahead
  });

  it("refuses past dates, dates beyond 60 days and nonsense", async () => {
    const id = await member();
    for (const bad of ["2026-11-19", "2027-01-20", "2026-13-40", "not-a-date", "2026-2-3"]) {
      expect(await startProgram(db(), id, FRI, bad)).toEqual({ error: "invalid_date" });
    }
    expect(await rows(id)).toHaveLength(0);
  });

  it("keeps an existing programme (start is idempotent)", async () => {
    const id = await member();
    await startProgram(db(), id, FRI);
    expect(await startProgram(db(), id, FRI, MON)).toEqual({ created: false });
    expect(await rows(id)).toHaveLength(1);
  });
});

describe("a programme that has not started yet", () => {
  it("Today reports the start date instead of a day to log, and logging is refused", async () => {
    const id = await member();
    await startProgram(db(), id, FRI, MON);
    expect(await getToday(db(), id, FRI)).toEqual({ ok: false, error: "not_started_yet", startDate: MON });
    expect(await saveDay(db(), id, "2026-11-20", { runKm: 5 }, FRI)).toMatchObject({ ok: false, error: "before_start" });
  });

  it("getProgramme counts down, then flips to started on the day", async () => {
    const id = await member();
    await startProgram(db(), id, FRI, MON);
    expect(await getProgramme(db(), id, FRI)).toMatchObject({ started: false, dayNumber: null, daysUntilStart: 3, startDate: MON });
    expect(await getProgramme(db(), id, new Date("2026-11-23T06:00:00Z"))).toMatchObject({ started: true, dayNumber: 1, daysUntilStart: 0 });
    expect(await getProgramme(db(), await member(), FRI)).toBeNull();
  });
});

describe("restarting", () => {
  it("retires the old programme (kept, not deleted) and begins fresh", async () => {
    const id = await member();
    await startProgram(db(), id, FRI);
    await saveDay(db(), id, "2026-11-20", { runKm: 5, waterL: 3 }, FRI);
    expect((await getJourneyRows(db(), id, FRI))!.rows).toHaveLength(1);

    expect(await restartProgram(db(), id, FRI, MON)).toEqual({ ok: true, startDate: MON });
    const all = await rows(id);
    expect(all).toHaveLength(2);
    expect(all.filter((c) => c.active)).toHaveLength(1);
    expect(all.find((c) => c.active)!.startDate).toBe(MON);

    // the old day is still in the database ...
    expect((await ctx.db.select().from(t.dailyLogs).where(eq(t.dailyLogs.userId, id))).length).toBe(1);
    // ... but nothing shows it any more
    expect((await getJourneyRows(db(), id, FRI))!.rows).toHaveLength(0);
    expect(await getToday(db(), id, FRI)).toMatchObject({ ok: false, error: "not_started_yet" });
  });

  it("can restart from today, and validates the date like a first start", async () => {
    const id = await member();
    await startProgram(db(), id, FRI, MON);
    expect(await restartProgram(db(), id, FRI)).toEqual({ ok: true, startDate: "2026-11-20" });
    expect((await getToday(db(), id, FRI)).ok).toBe(true);
    expect(await restartProgram(db(), id, FRI, "2020-01-01")).toEqual({ ok: false, error: "invalid_date" });
    expect((await rows(id)).filter((c) => c.active)).toHaveLength(1); // a refused restart changes nothing
  });
});
