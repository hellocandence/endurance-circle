import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerUser, requestPasswordReset, resendVerification, resetPassword, verifyEmail } from "@/server/auth/account";
import { createSession, loginWithCredentials } from "@/server/auth/credentials";
import type { Email, Mailer } from "@/server/email";
import * as t from "@/server/db/schema";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
const sent: Email[] = [];
const mailer: Mailer = { send: async (m) => void sent.push(m) };
const tokenFrom = (m: Email) => m.text.match(/token=([\w-]+)/)![1];
const last = () => sent[sent.length - 1];

beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(() => ctx.close());

describe("sign-up → verify → login", () => {
  const email = "new@example.com";
  const password = "a-long-enough-pw";

  it("registers an unverified member who cannot log in until verifying", async () => {
    const r = await registerUser(db(), mailer, { email: "New@Example.com", password, name: "Nia" });
    expect(r.ok).toBe(true);
    const [u] = await ctx.db.select().from(t.users).where(eq(t.users.email, email));
    expect(u).toMatchObject({ role: "MEMBER", emailVerified: null });
    expect(await loginWithCredentials(db(), { email, password })).toEqual({ ok: false, reason: "unverified" });
  });

  it("emails a link, stores only its hash, and the link verifies once", async () => {
    expect(last().to).toBe(email);
    const token = tokenFrom(last());
    const stored = await ctx.db.select().from(t.verificationTokens);
    expect(stored.some((s) => s.token === token)).toBe(false); // raw token never stored

    expect(await verifyEmail(db(), token)).toBe(true);
    expect(await verifyEmail(db(), token)).toBe(false); // single use
    expect((await loginWithCredentials(db(), { email, password })).ok).toBe(true);
  });

  it("rejects weak passwords and duplicate emails", async () => {
    expect(await registerUser(db(), mailer, { email: "w@example.com", password: "short", name: "W" })).toMatchObject({ reason: "weak_password" });
    expect(await registerUser(db(), mailer, { email, password, name: "Dup" })).toEqual({ ok: false, reason: "email_taken" });
  });

  it("rejects an expired verification token (24 h)", async () => {
    const start = new Date("2026-01-01T00:00:00Z");
    await registerUser(db(), mailer, { email: "late@example.com", password, name: "L", now: start });
    expect(await verifyEmail(db(), tokenFrom(last()), new Date(start.getTime() + 25 * 3600 * 1000))).toBe(false);
  });

  it("resend only mails real unverified accounts", async () => {
    const before = sent.length;
    await resendVerification(db(), mailer, "ghost@example.com");
    await resendVerification(db(), mailer, email); // already verified
    expect(sent.length).toBe(before);
    await resendVerification(db(), mailer, "late@example.com");
    expect(sent.length).toBe(before + 1);
  });
});

describe("password reset", () => {
  const email = "new@example.com";

  it("sends nothing for unknown emails (no enumeration) and a link for known ones", async () => {
    const before = sent.length;
    await requestPasswordReset(db(), mailer, "nobody@example.com");
    expect(sent.length).toBe(before);
    await requestPasswordReset(db(), mailer, email);
    expect(sent.length).toBe(before + 1);
  });

  it("a new request revokes the previous link", async () => {
    const first = tokenFrom(last());
    await requestPasswordReset(db(), mailer, email);
    expect(await resetPassword(db(), { token: first, password: "brand-new-password" })).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("works once, signs out all sessions, and swaps the password", async () => {
    const [u] = await ctx.db.select().from(t.users).where(eq(t.users.email, email));
    const s = await createSession(db(), u.id);
    const token = tokenFrom(last());

    expect(await resetPassword(db(), { token, password: "brand-new-password" })).toEqual({ ok: true });
    expect(await resetPassword(db(), { token, password: "another-new-password" })).toEqual({ ok: false, reason: "invalid_token" });

    expect(await ctx.db.select().from(t.sessions).where(eq(t.sessions.sessionToken, s.sessionToken))).toHaveLength(0);
    expect((await loginWithCredentials(db(), { email, password: "a-long-enough-pw" })).ok).toBe(false);
    expect((await loginWithCredentials(db(), { email, password: "brand-new-password" })).ok).toBe(true);
  });

  it("expires after 30 minutes", async () => {
    const start = new Date("2026-02-01T00:00:00Z");
    await requestPasswordReset(db(), mailer, email, start);
    const token = tokenFrom(last());
    expect(await resetPassword(db(), { token, password: "yet-another-password", now: new Date(start.getTime() + 31 * 60 * 1000) })).toEqual({
      ok: false,
      reason: "invalid_token",
    });
    await requestPasswordReset(db(), mailer, email, start);
    expect(await resetPassword(db(), { token: tokenFrom(last()), password: "yet-another-password", now: new Date(start.getTime() + 29 * 60 * 1000) })).toEqual({ ok: true });
  });

  it("a weak password does not burn the token", async () => {
    await requestPasswordReset(db(), mailer, email);
    const token = tokenFrom(last());
    expect(await resetPassword(db(), { token, password: "short" })).toMatchObject({ reason: "weak_password" });
    expect(await resetPassword(db(), { token, password: "a-proper-long-password" })).toEqual({ ok: true });
  });

  it("a reset also verifies an unverified email (the link proved inbox control)", async () => {
    await requestPasswordReset(db(), mailer, "late@example.com");
    await resetPassword(db(), { token: tokenFrom(last()), password: "late-new-password" });
    const [u] = await ctx.db.select().from(t.users).where(eq(t.users.email, "late@example.com"));
    expect(u.emailVerified).not.toBeNull();
  });
});
