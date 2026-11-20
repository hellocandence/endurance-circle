import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMembers, removeMember } from "@/server/admin/service";
import { createAdapter } from "@/server/auth/adapter";
import { createSession, loginWithCredentials } from "@/server/auth/credentials";
import { hashPassword } from "@/server/auth/password";
import { getPublicDashboard } from "@/server/dashboard/public";
import * as t from "@/server/db/schema";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
let ownerId: string;
let ids: Record<string, string>;
const PASSWORD = "a-long-enough-pw";

beforeAll(async () => {
  ctx = await makeTestDb();
  const passwordHash = await hashPassword(PASSWORD);
  const rows = await ctx.db.insert(t.users).values([
    { email: "owner@example.com", name: "Owner", role: "OWNER", passwordHash, emailVerified: new Date() },
    { email: "soft@example.com", name: "Soft", passwordHash, emailVerified: new Date() },
    { email: "hard@example.com", name: "Hard", passwordHash, emailVerified: new Date() },
    { email: "pending@example.com", name: "Pending", passwordHash },
  ]).returning({ id: t.users.id, email: t.users.email });
  ids = Object.fromEntries(rows.map((r) => [r.email.split("@")[0], r.id]));
  ownerId = ids.owner;
  await ctx.db.insert(t.bodyMetrics).values([{ userId: ids.soft, weightKg: "70" }, { userId: ids.hard, weightKg: "80" }]);
  await ctx.db.insert(t.commitments).values([{ userId: ids.hard, startDate: "2026-11-20" }]);
});
afterAll(() => ctx.close());

describe("removeMember", () => {
  it("never removes the owner (BR2)", async () => {
    expect(await removeMember(db(), ownerId, ownerId)).toEqual({ ok: false, error: "is_owner" });
    expect(await removeMember(db(), ids.soft, ownerId)).toEqual({ ok: false, error: "is_owner" }); // even if asked by someone else
    const [o] = await ctx.db.select().from(t.users).where(eq(t.users.id, ownerId));
    expect(o.disabled).toBe(false);
  });

  it("reports unknown members", async () => {
    expect(await removeMember(db(), ownerId, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "not_found" });
  });

  it("default: disables the account, ends every session, keeps their data, hides them from the circle", async () => {
    const s = await createSession(db(), ids.soft);
    expect((await getPublicDashboard(db(), new Date())).members.map((m) => m.displayName)).toContain("Soft");

    expect(await removeMember(db(), ownerId, ids.soft)).toEqual({ ok: true, mode: "disabled" });

    expect(await createAdapter(db()).getSessionAndUser!(s.sessionToken)).toBeNull(); // session is gone
    expect(await loginWithCredentials(db(), { email: "soft@example.com", password: PASSWORD })).toEqual({ ok: false, reason: "invalid" }); // cannot sign in
    expect((await getPublicDashboard(db(), new Date())).members.map((m) => m.displayName)).not.toContain("Soft");
    expect(await ctx.db.select().from(t.bodyMetrics).where(eq(t.bodyMetrics.userId, ids.soft))).toHaveLength(1); // data kept
  });

  it("permanent: deletes the account and everything they logged", async () => {
    await ctx.db.insert(t.dailyLogs).values({ userId: ids.hard, commitmentId: (await ctx.db.select().from(t.commitments).where(eq(t.commitments.userId, ids.hard)))[0].id, logDate: "2026-11-20", dayNumber: 1, isSunday: false });
    expect(await removeMember(db(), ownerId, ids.hard, { permanent: true })).toEqual({ ok: true, mode: "deleted" });
    expect(await ctx.db.select().from(t.users).where(eq(t.users.id, ids.hard))).toHaveLength(0);
    for (const table of [t.bodyMetrics, t.commitments, t.dailyLogs, t.profiles]) {
      expect(await ctx.db.select().from(table).where(eq(table.userId, ids.hard))).toHaveLength(0);
    }
  });

  it("permanent delete works for a member who joined with an invite (the invite row is kept, detached)", async () => {
    const [joiner] = await ctx.db.insert(t.users).values({ email: "joiner@example.com", name: "Joiner", emailVerified: new Date() }).returning({ id: t.users.id });
    const [inv] = await ctx.db.insert(t.invites).values({ tokenHash: "h1", createdBy: ownerId, expiresAt: new Date(Date.now() + 1e9), usedAt: new Date(), usedBy: joiner.id }).returning({ id: t.invites.id });
    expect(await removeMember(db(), ownerId, joiner.id, { permanent: true })).toEqual({ ok: true, mode: "deleted" });
    const [row] = await ctx.db.select().from(t.invites).where(eq(t.invites.id, inv.id));
    expect(row).toMatchObject({ usedBy: null, createdBy: ownerId });
  });

  it("is written to the audit log", async () => {
    const log = await ctx.db.select().from(t.auditLog);
    expect(log.map((l) => [l.action, l.actorId, l.target])).toEqual(
      expect.arrayContaining([["member.disable", ownerId, ids.soft], ["member.delete", ownerId, ids.hard]]),
    );
  });
});

describe("listMembers and the circle", () => {
  it("lists everyone with status, for the owner only (the route enforces who)", async () => {
    const list = await listMembers(db());
    expect(list.find((m) => m.email === "soft@example.com")).toMatchObject({ disabled: true, verified: true });
    expect(list.find((m) => m.email === "pending@example.com")).toMatchObject({ disabled: false, verified: false });
    expect(JSON.stringify(list)).not.toMatch(/passwordHash|argon2/);
  });

  it("people who have not confirmed their email are not in the circle yet", async () => {
    expect((await getPublicDashboard(db(), new Date())).members.map((m) => m.displayName)).not.toContain("Pending");
  });
});
