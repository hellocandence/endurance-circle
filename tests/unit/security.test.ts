import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdapter } from "@/server/auth/adapter";
import { createSession, loginWithCredentials } from "@/server/auth/credentials";
import { hashPassword } from "@/server/auth/password";
import { changePassword, endSession, signOutEverywhere } from "@/server/auth/security";
import * as t from "@/server/db/schema";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
const OLD = "old-password-123";
let userId: string;
let otherId: string;
let googleId: string;
const sessionsOf = (id: string) => ctx.db.select().from(t.sessions).where(eq(t.sessions.userId, id));

beforeAll(async () => {
  ctx = await makeTestDb();
  const passwordHash = await hashPassword(OLD);
  const rows = await ctx.db.insert(t.users).values([
    { email: "a@example.com", name: "A", passwordHash, emailVerified: new Date() },
    { email: "b@example.com", name: "B", passwordHash, emailVerified: new Date() },
    { email: "g@example.com", name: "G", emailVerified: new Date() }, // Google only
  ]).returning({ id: t.users.id });
  [userId, otherId, googleId] = rows.map((r) => r.id);
});
afterAll(() => ctx.close());

describe("changePassword", () => {
  it("refuses a wrong current password and changes nothing", async () => {
    const s = await createSession(db(), userId);
    expect(await changePassword(db(), userId, { currentPassword: "nope-nope-nope", newPassword: "brand-new-password", keepSessionToken: s.sessionToken })).toEqual({ ok: false, reason: "wrong_password" });
    expect((await loginWithCredentials(db(), { email: "a@example.com", password: OLD })).ok).toBe(true);
  });

  it("validates the new password (length, not the same as the old)", async () => {
    expect(await changePassword(db(), userId, { currentPassword: OLD, newPassword: "short" })).toMatchObject({ ok: false, reason: "weak_password" });
    expect(await changePassword(db(), userId, { currentPassword: OLD, newPassword: OLD })).toEqual({ ok: false, reason: "same_password" });
  });

  it("changes the password and signs out every other device but keeps this one", async () => {
    await signOutEverywhere(db(), userId);
    const current = await createSession(db(), userId);
    const phone = await createSession(db(), userId);
    const laptop = await createSession(db(), userId);
    const bobs = await createSession(db(), otherId);

    const r = await changePassword(db(), userId, { currentPassword: OLD, newPassword: "brand-new-password", keepSessionToken: current.sessionToken });
    expect(r).toEqual({ ok: true, signedOutOthers: 2 });

    const adapter = createAdapter(db());
    expect(await adapter.getSessionAndUser!(current.sessionToken)).not.toBeNull();
    expect(await adapter.getSessionAndUser!(phone.sessionToken)).toBeNull();
    expect(await adapter.getSessionAndUser!(laptop.sessionToken)).toBeNull();
    expect(await adapter.getSessionAndUser!(bobs.sessionToken)).not.toBeNull(); // someone else is untouched

    expect((await loginWithCredentials(db(), { email: "a@example.com", password: OLD })).ok).toBe(false);
    expect((await loginWithCredentials(db(), { email: "a@example.com", password: "brand-new-password" })).ok).toBe(true);
  });

  it("without a session to keep, every session ends", async () => {
    await createSession(db(), otherId);
    const r = await changePassword(db(), otherId, { currentPassword: OLD, newPassword: "another-new-password" });
    expect(r.ok && r.signedOutOthers).toBeGreaterThanOrEqual(2);
    expect(await sessionsOf(otherId)).toHaveLength(0);
  });

  it("a Google-only account must use the email reset flow", async () => {
    expect(await changePassword(db(), googleId, { currentPassword: "anything", newPassword: "brand-new-password" })).toEqual({ ok: false, reason: "no_password" });
    const [u] = await ctx.db.select().from(t.users).where(eq(t.users.id, googleId));
    expect(u.passwordHash).toBeNull();
  });

  it("an unknown user is treated like one without a password", async () => {
    expect(await changePassword(db(), "00000000-0000-4000-8000-000000000000", { currentPassword: "x", newPassword: "brand-new-password" })).toEqual({ ok: false, reason: "no_password" });
  });
});

describe("signOutEverywhere", () => {
  it("old sessions stop resolving, for this member only", async () => {
    const a1 = await createSession(db(), userId);
    const a2 = await createSession(db(), userId);
    const g1 = await createSession(db(), googleId);
    expect(await signOutEverywhere(db(), userId)).toBeGreaterThanOrEqual(2);
    const adapter = createAdapter(db());
    expect(await adapter.getSessionAndUser!(a1.sessionToken)).toBeNull();
    expect(await adapter.getSessionAndUser!(a2.sessionToken)).toBeNull();
    expect(await adapter.getSessionAndUser!(g1.sessionToken)).not.toBeNull();
  });
});

describe("endSession", () => {
  it("ends only the given session of that member", async () => {
    const phone = await createSession(db(), userId);
    const laptop = await createSession(db(), userId);
    const bobs = await createSession(db(), otherId);
    expect(await endSession(db(), userId, phone.sessionToken)).toBe(true);
    const adapter = createAdapter(db());
    expect(await adapter.getSessionAndUser!(phone.sessionToken)).toBeNull();
    expect(await adapter.getSessionAndUser!(laptop.sessionToken)).not.toBeNull(); // other devices stay signed in
    expect(await endSession(db(), userId, bobs.sessionToken)).toBe(false); // someone else's session is untouchable
    expect(await adapter.getSessionAndUser!(bobs.sessionToken)).not.toBeNull();
  });
});
