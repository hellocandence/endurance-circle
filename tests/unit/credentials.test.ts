import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdapter } from "@/server/auth/adapter";
import { loginWithCredentials } from "@/server/auth/credentials";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { sessionCookie } from "@/server/auth/session-config";
import * as t from "@/server/db/schema";
import { makeTestDb } from "./helpers/db";

const PASSWORD = "correct horse battery";
let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;

beforeAll(async () => {
  ctx = await makeTestDb();
  const passwordHash = await hashPassword(PASSWORD);
  await ctx.db.insert(t.users).values([
    { email: "ok@example.com", name: "Ok", passwordHash, emailVerified: new Date() },
    { email: "unverified@example.com", name: "Un", passwordHash },
    { email: "disabled@example.com", name: "Dis", passwordHash, emailVerified: new Date(), disabled: true },
    { email: "google@example.com", name: "G", emailVerified: new Date() }, // no password
  ]);
});
afterAll(() => ctx.close());

describe("password hashing (NFR-01)", () => {
  it("uses argon2id and verifies", async () => {
    const h = await hashPassword("pw-12345678");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "pw-12345678")).toBe(true);
    expect(await verifyPassword(h, "other")).toBe(false);
    expect(await verifyPassword("garbage", "x")).toBe(false);
  });
  it("enforces length bounds", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("x".repeat(129))).not.toBeNull();
    expect(passwordProblem("long enough pw")).toBeNull();
  });
});

describe("loginWithCredentials", () => {
  it("wrong password fails and creates no session", async () => {
    const r = await loginWithCredentials(db(), { email: "ok@example.com", password: "nope-nope-nope" });
    expect(r).toEqual({ ok: false, reason: "invalid" });
    expect(await ctx.db.select().from(t.sessions)).toHaveLength(0);
  });

  it("correct password creates a 90-day database session readable by the Auth.js adapter", async () => {
    const now = new Date("2026-11-20T10:00:00Z");
    const r = await loginWithCredentials(db(), { email: " OK@Example.com ", password: PASSWORD, now });
    if (!r.ok) throw new Error("expected success");
    expect(r.expires.getTime() - now.getTime()).toBe(90 * 24 * 3600 * 1000);

    const rows = await ctx.db.select().from(t.sessions).where(eq(t.sessions.sessionToken, r.sessionToken));
    expect(rows).toHaveLength(1);

    const adapter = createAdapter(db());
    const found = await adapter.getSessionAndUser!(r.sessionToken);
    expect(found?.user.email).toBe("ok@example.com");
  });

  it("rejects unverified email only after the password is proven", async () => {
    expect(await loginWithCredentials(db(), { email: "unverified@example.com", password: PASSWORD })).toEqual({
      ok: false,
      reason: "unverified",
    });
    expect(await loginWithCredentials(db(), { email: "unverified@example.com", password: "wrong-wrong-wrong" })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("treats disabled users, unknown emails and password-less accounts as invalid", async () => {
    for (const email of ["disabled@example.com", "nobody@example.com", "google@example.com"]) {
      expect(await loginWithCredentials(db(), { email, password: PASSWORD })).toEqual({ ok: false, reason: "invalid" });
    }
  });
});

describe("disabled users", () => {
  it("lose access immediately: an existing session no longer resolves", async () => {
    const r = await loginWithCredentials(db(), { email: "ok@example.com", password: PASSWORD });
    if (!r.ok) throw new Error("expected success");
    const adapter = createAdapter(db());
    expect(await adapter.getSessionAndUser!(r.sessionToken)).not.toBeNull();

    await ctx.db.update(t.users).set({ disabled: true }).where(eq(t.users.email, "ok@example.com"));
    expect(await adapter.getSessionAndUser!(r.sessionToken)).toBeNull();
    await ctx.db.update(t.users).set({ disabled: false }).where(eq(t.users.email, "ok@example.com"));
  });
});

describe("sessionCookie", () => {
  it("uses the __Secure- prefix for https", () => {
    expect(sessionCookie({ AUTH_URL: "https://cadence.onrender.com" })).toEqual({
      name: "__Secure-authjs.session-token",
      secure: true,
    });
    expect(sessionCookie({ AUTH_URL: "http://localhost:3000" })).toEqual({ name: "authjs.session-token", secure: false });
    expect(sessionCookie({ NODE_ENV: "production" }).secure).toBe(true);
  });
});
