import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { bodyMetrics, privateJourney, publicMember, type BodyMetricsRow, type DailyLogRow } from "@/server/privacy";
import { publicLogColumns, publicUserColumns } from "@/server/privacy/columns";
import { ForbiddenError } from "@/server/rbac/errors";
import { bodyMetrics as bodyMetricsTable, dailyLogs, users } from "@/server/db/schema";

const owner = { id: "owner", role: "OWNER" as const };
const alice = { id: "alice", role: "MEMBER" as const };
const bob = { id: "bob", role: "MEMBER" as const };

const log: DailyLogRow = {
  id: "l1", logDate: "2026-11-20", dayNumber: 3, isSunday: false, runKm: "5.50", warmupPreDone: true, warmupPostDone: true,
  stretchMin: 0, waterL: "3.00", electrolytesDone: true, proteinG: 90, studyMin: 70, studyTopic: "SQL", techNote: "indexes",
  githubContribution: true, readingMin: 20, readingTitle: "Book", updateText: "Day 3 done!", privateNotes: "SECRET-NOTE-123",
  completed: true, missedTasks: [],
};
const body: BodyMetricsRow = { userId: "alice", weightKg: "71.50", heightCm: "172.0", proteinMultiplier: "1.20", waterTargetL: "3.0", runTargetKm: "5.0", studyMinTarget: 75 };

describe("publicMember never contains body metrics or private notes", () => {
  // A hostile input that carries every sensitive field: the projection must not pass any of it on.
  const hostile = {
    ...log,
    id: "alice", name: "Alice", updateText: "Day 3!", todayDone: 6, todayTotal: 8, dayNumber: 3, streak: 3, commitmentPct: 80,
    weightKg: 71.5, weight_kg: 71.5, heightCm: 172, proteinMultiplier: 1.2, waterTargetL: 3, runTargetKm: 5, studyMinTarget: 75,
    proteinTargetG: 86, privateNotes: "SECRET-NOTE-123", private_notes: "SECRET-NOTE-123", bodyMetrics: body, limits: { x: 1 },
    email: "alice@example.com", passwordHash: "$argon2id$x", role: "MEMBER", timeZone: "Asia/Kolkata",
  };

  it("returns exactly the allowlisted keys", () => {
    expect(Object.keys(publicMember(hostile)).sort()).toEqual(
      ["avatarUrl", "commitmentPct", "dayNumber", "displayName", "doneTasks", "id", "requiredTasks", "streak", "todayDone", "todayTotal", "updateText"].sort(),
    );
  });

  it("serialises without any sensitive field name or value", () => {
    const json = JSON.stringify(publicMember(hostile));
    for (const secret of ["SECRET-NOTE-123", "71.5", "172", "86", "alice@example.com", "argon2", "Asia/Kolkata", "SQL", "indexes"]) {
      expect(json).not.toContain(secret);
    }
    for (const key of [/weight/i, /height/i, /protein/i, /limit/i, /private/i, /body/i, /water/i, /email/i, /password/i, /note/i]) {
      expect(json).not.toMatch(key);
    }
  });

  it("keeps the public fields", () => {
    expect(publicMember(hostile)).toMatchObject({ id: "alice", displayName: "Alice", todayDone: 6, todayTotal: 8, streak: 3, dayNumber: 3, commitmentPct: 80, updateText: "Day 3!" });
  });

  it("defaults missing values safely", () => {
    expect(publicMember({ id: "x", name: "X" })).toEqual({ id: "x", displayName: "X", avatarUrl: null, todayDone: 0, todayTotal: 0, dayNumber: null, streak: 0, updateText: null, commitmentPct: 0, doneTasks: [], requiredTasks: [] });
  });
});

describe("public column allowlists", () => {
  it("publicLogColumns excludes private notes and free-text fields", () => {
    const keys = Object.keys(publicLogColumns);
    for (const banned of ["privateNotes", "techNote", "studyTopic", "readingTitle", "missedTasks", "id"]) expect(keys).not.toContain(banned);
    expect(keys).toContain("updateText");
  });

  it("only references real daily_logs columns", () => {
    const all = Object.keys(getTableColumns(dailyLogs));
    for (const k of Object.keys(publicLogColumns)) expect(all).toContain(k);
  });

  it("never exposes any body_metrics column", () => {
    const publicCols = [...Object.values(publicLogColumns), ...Object.values(publicUserColumns)];
    // every public column belongs to daily_logs or users, never to body_metrics
    for (const c of publicCols) expect(c.table).not.toBe(bodyMetricsTable);
    expect(publicCols.map((c) => c.name).some((n) => /weight|height|protein_mult|target|limit/.test(n))).toBe(false);
  });

  it("publicUserColumns excludes email, password hash and time zone", () => {
    const keys = Object.keys(publicUserColumns);
    expect(keys.sort()).toEqual(["id", "name"]);
    expect(Object.keys(getTableColumns(users))).toContain("passwordHash"); // it exists, so the exclusion is meaningful
  });
});

describe("bodyMetrics projection (open to the whole circle since T104)", () => {
  it("the member, the owner and any other member can read (AT-01); a guest cannot", () => {
    expect(bodyMetrics(alice, "alice", body).weightKg).toBe(71.5);
    expect(bodyMetrics(owner, "alice", body).weightKg).toBe(71.5);
    expect(bodyMetrics(bob, "alice", body).weightKg).toBe(71.5);
    expect(() => bodyMetrics(null as never, "alice", body)).toThrow(ForbiddenError);
  });

  it("converts numerics and derives the protein target (1.2 × 71.5 → 86)", () => {
    expect(bodyMetrics(alice, "alice", body)).toEqual({
      userId: "alice", weightKg: 71.5, heightCm: 172, proteinMultiplier: 1.2, waterTargetL: 3, runTargetKm: 5, studyMinTarget: 75, proteinTargetG: 86,
    });
    expect(bodyMetrics(alice, "alice", { ...body, weightKg: null }).proteinTargetG).toBeNull();
  });
});

describe("privateJourney projection (open to the whole circle since T104)", () => {
  it("returns the full log (with notes) to the member, the owner and other members (AT-02)", () => {
    for (const who of [alice, owner, bob]) expect(privateJourney(who, "alice", [log]).logs[0].privateNotes).toBe("SECRET-NOTE-123");
  });

  it("refuses a guest", () => {
    expect(() => privateJourney(null as never, "alice", [log])).toThrow(ForbiddenError);
  });

  it("converts numerics and copies arrays", () => {
    const out = privateJourney(alice, "alice", [{ ...log, missedTasks: ["RUN"] }]).logs[0];
    expect(out.runKm).toBe(5.5);
    expect(out.waterL).toBe(3);
    expect(out.missedTasks).toEqual(["RUN"]);
  });
});
