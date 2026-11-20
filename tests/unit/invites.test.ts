import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decideGoogleSignIn } from "@/server/auth/google";
import { createInvite, getUsableInvite, INVITE_TTL_MS, isInviteUsable, listInvites, revokeInvite, signUpWithInvite } from "@/server/auth/invites";
import { loginWithCredentials } from "@/server/auth/credentials";
import * as t from "@/server/db/schema";
import type { Email, Mailer } from "@/server/email";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
const sent: Email[] = [];
const mailer: Mailer = { send: async (m) => void sent.push(m) };
let ownerId: string;
let memberId: string;
const PASSWORD = "a-long-enough-pw";
let n = 0;
const signup = (token: string, over: Partial<{ email: string; password: string; now: Date }> = {}) =>
  signUpWithInvite(db(), mailer, { token, email: over.email ?? `p${++n}@example.com`, password: over.password ?? PASSWORD, name: "P", now: over.now });

beforeAll(async () => {
  ctx = await makeTestDb();
  [{ id: ownerId }, { id: memberId }] = await ctx.db
    .insert(t.users)
    .values([
      { email: "owner@example.com", name: "Owner", role: "OWNER", emailVerified: new Date() },
      { email: "member@example.com", name: "Member", emailVerified: new Date() },
    ])
    .returning({ id: t.users.id });
});
afterAll(() => ctx.close());

describe("creating invites", () => {
  it("is owner-only", async () => {
    await expect(createInvite(db(), memberId)).rejects.toThrow(/owner/i);
    await expect(createInvite(db(), "00000000-0000-0000-0000-000000000000")).rejects.toThrow();
  });

  it("makes a 7-day token and stores only its hash", async () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const inv = await createInvite(db(), ownerId, now);
    expect(inv.expiresAt.getTime() - now.getTime()).toBe(INVITE_TTL_MS);
    const rows = await ctx.db.select().from(t.invites).where(eq(t.invites.id, inv.id));
    expect(rows[0].tokenHash).not.toBe(inv.token);
    expect(JSON.stringify(rows[0])).not.toContain(inv.token);
  });
});

describe("AT-06: an invite works once", () => {
  it("second use is rejected", async () => {
    const { token } = await createInvite(db(), ownerId);
    expect((await signup(token)).ok).toBe(true);
    expect(await signup(token)).toEqual({ ok: false, reason: "invalid_invite" });
  });

  it("records who used it and the new member can log in after verifying", async () => {
    const { id, token } = await createInvite(db(), ownerId);
    const email = "joiner@example.com";
    const r = await signup(token, { email });
    if (!r.ok) throw new Error("expected success");
    const [inv] = await ctx.db.select().from(t.invites).where(eq(t.invites.id, id));
    expect(inv.usedBy).toBe(r.userId);
    expect(inv.usedAt).not.toBeNull();
    expect(sent.at(-1)?.to).toBe(email);
    expect(await loginWithCredentials(db(), { email, password: PASSWORD })).toEqual({ ok: false, reason: "unverified" });
  });

  it("two simultaneous sign-ups with one invite: exactly one wins", async () => {
    const { token } = await createInvite(db(), ownerId);
    const results = await Promise.all([signup(token), signup(token), signup(token)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe("AT-07: expired invites are rejected", () => {
  it("rejects after 7 days, accepts just before", async () => {
    const start = new Date("2026-04-01T00:00:00Z");
    const late = await createInvite(db(), ownerId, start);
    expect(await signup(late.token, { now: new Date(start.getTime() + INVITE_TTL_MS + 1000) })).toEqual({ ok: false, reason: "invalid_invite" });
    const ok = await createInvite(db(), ownerId, start);
    expect((await signup(ok.token, { now: new Date(start.getTime() + INVITE_TTL_MS - 1000) })).ok).toBe(true);
  });
});

describe("other invalid invites", () => {
  it("rejects revoked, unknown and tampered tokens", async () => {
    const { id, token } = await createInvite(db(), ownerId);
    expect(await revokeInvite(db(), id)).toBe(true);
    expect(await revokeInvite(db(), id)).toBe(false);
    expect(await signup(token)).toEqual({ ok: false, reason: "invalid_invite" });
    expect(await signup("not-a-real-token")).toEqual({ ok: false, reason: "invalid_invite" });
    const fresh = await createInvite(db(), ownerId);
    expect(await signup(fresh.token.slice(0, -1) + (fresh.token.endsWith("A") ? "B" : "A"))).toEqual({ ok: false, reason: "invalid_invite" });
  });

  it("cannot revoke an invite that was already used", async () => {
    const { id, token } = await createInvite(db(), ownerId);
    await signup(token);
    expect(await revokeInvite(db(), id)).toBe(false);
  });
});

describe("a failed sign-up does not burn the invite", () => {
  it("weak password", async () => {
    const { token } = await createInvite(db(), ownerId);
    expect(await signup(token, { password: "short" })).toMatchObject({ reason: "weak_password" });
    expect(await isInviteUsable(db(), token)).toBe(true);
  });

  it("email already registered (transaction rolls back)", async () => {
    const { token } = await createInvite(db(), ownerId);
    expect(await signup(token, { email: "member@example.com" })).toEqual({ ok: false, reason: "email_taken" });
    expect(await isInviteUsable(db(), token)).toBe(true);
    expect((await signup(token)).ok).toBe(true);
  });
});

describe("listing", () => {
  it("derives status", async () => {
    const list = await listInvites(db());
    const statuses = new Set(list.map((i) => i.status));
    expect(statuses.has("used")).toBe(true);
    expect(statuses.has("revoked")).toBe(true);
    expect(statuses.has("expired")).toBe(true);
    expect(JSON.stringify(list)).not.toContain("tokenHash");
  });
});

describe("Google sign-up with an invite (BR1)", () => {
  const profile = { email: "Newbie@Example.com", email_verified: true, name: "Newbie" };

  it("a stranger is denied without an invite or with a bad one", async () => {
    expect(await decideGoogleSignIn(db(), profile)).toBe(false);
    expect(await decideGoogleSignIn(db(), profile, { inviteToken: "bogus" })).toBe(false);
    expect(await ctx.db.select().from(t.users).where(eq(t.users.email, "newbie@example.com"))).toHaveLength(0);
  });

  it("a valid invite creates a verified, password-less member and is then spent", async () => {
    const { token } = await createInvite(db(), ownerId);
    expect(await decideGoogleSignIn(db(), profile, { inviteToken: token })).toBe(true);
    const [u] = await ctx.db.select().from(t.users).where(eq(t.users.email, "newbie@example.com"));
    expect(u).toMatchObject({ name: "Newbie", role: "MEMBER", passwordHash: null });
    expect(u.emailVerified).not.toBeNull();
    expect(await isInviteUsable(db(), token)).toBe(false);
    expect(await ctx.db.select().from(t.profiles).where(eq(t.profiles.userId, u.id))).toHaveLength(1);
  });

  it("an unverified Google email never gets an account", async () => {
    const { token } = await createInvite(db(), ownerId);
    expect(await decideGoogleSignIn(db(), { ...profile, email: "other@example.com", email_verified: false }, { inviteToken: token })).toBe(false);
    expect(await isInviteUsable(db(), token)).toBe(true);
  });
});

describe("invites sent to an email address", () => {
  const sentTo = (email: string) => sent.filter((m) => m.to === email);

  it("remembers the address, lowercased, and exposes it to the sign-up page", async () => {
    const { token } = await createInvite(db(), ownerId, new Date(), "  Bound.One@Example.com ");
    expect(await getUsableInvite(db(), token)).toEqual({ email: "bound.one@example.com" });
    const { token: open } = await createInvite(db(), ownerId);
    expect(await getUsableInvite(db(), open)).toEqual({ email: null });
  });

  it("password sign-up on the right address is verified at once and sends no verification email", async () => {
    const email = "bound.two@example.com";
    const { token } = await createInvite(db(), ownerId, new Date(), email);
    expect(await signup(token, { email })).toMatchObject({ ok: true });
    const [user] = await ctx.db.select().from(t.users).where(eq(t.users.email, email));
    expect(user.emailVerified).not.toBeNull();
    expect(sentTo(email)).toHaveLength(0);
    expect(await loginWithCredentials(db(), { email, password: PASSWORD })).toMatchObject({ ok: true });
  });

  it("refuses a different address for password sign-up and keeps the invite usable", async () => {
    const { token } = await createInvite(db(), ownerId, new Date(), "bound.three@example.com");
    expect(await signup(token, { email: "someone.else@example.com" })).toMatchObject({ ok: false, reason: "email_mismatch" });
    expect(await isInviteUsable(db(), token)).toBe(true);
  });

  it("refuses a different Google account and accepts the invited one", async () => {
    const email = "bound.four@example.com";
    const { token } = await createInvite(db(), ownerId, new Date(), email);
    expect(await decideGoogleSignIn(db(), { email: "other@example.com", email_verified: true }, { inviteToken: token })).toBe(false);
    expect(await isInviteUsable(db(), token)).toBe(true);
    expect(await decideGoogleSignIn(db(), { email: email.toUpperCase(), email_verified: true, name: "Four" }, { inviteToken: token })).toBe(true);
    const [user] = await ctx.db.select().from(t.users).where(eq(t.users.email, email));
    expect(user.emailVerified).not.toBeNull();
  });

  it("password and Google share one account: Google after a password sign-up keeps the password", async () => {
    const email = "bound.five@example.com";
    const { token } = await createInvite(db(), ownerId, new Date(), email);
    await signup(token, { email });
    expect(await decideGoogleSignIn(db(), { email, email_verified: true })).toBe(true);
    const rows = await ctx.db.select().from(t.users).where(eq(t.users.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash).not.toBeNull();
    expect(await loginWithCredentials(db(), { email, password: PASSWORD })).toMatchObject({ ok: true });
  });
});
