import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdapter } from "@/server/auth/adapter";
import { createSession } from "@/server/auth/credentials";
import { decideGoogleSignIn } from "@/server/auth/google";
import * as t from "@/server/db/schema";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
const verified = { email_verified: true };

beforeAll(async () => {
  ctx = await makeTestDb();
  await ctx.db.insert(t.users).values([
    { email: "member@example.com", name: "M", emailVerified: new Date(), passwordHash: "hash" },
    { email: "pending@example.com", name: "P", passwordHash: "attacker-chosen-hash" }, // never verified
    { email: "off@example.com", name: "O", emailVerified: new Date(), disabled: true },
  ]);
});
afterAll(() => ctx.close());

describe("decideGoogleSignIn", () => {
  it("allows an existing verified member (case-insensitive)", async () => {
    expect(await decideGoogleSignIn(db(), { email: "Member@Example.com", ...verified })).toBe(true);
  });

  it("denies unknown emails (invite-only), disabled users, and unverified Google emails", async () => {
    expect(await decideGoogleSignIn(db(), { email: "stranger@example.com", ...verified })).toBe(false);
    expect(await decideGoogleSignIn(db(), { email: "off@example.com", ...verified })).toBe(false);
    expect(await decideGoogleSignIn(db(), { email: "member@example.com", email_verified: false })).toBe(false);
    expect(await decideGoogleSignIn(db(), { email: "member@example.com" })).toBe(false);
    expect(await decideGoogleSignIn(db(), { email: null, ...verified })).toBe(false);
  });

  it("linking to a never-verified password account wipes the unproven password and its sessions", async () => {
    const [u] = await ctx.db.select().from(t.users).where(eq(t.users.email, "pending@example.com"));
    const s = await createSession(db(), u.id);

    expect(await decideGoogleSignIn(db(), { email: "pending@example.com", ...verified })).toBe(true);

    const [after] = await ctx.db.select().from(t.users).where(eq(t.users.email, "pending@example.com"));
    expect(after.passwordHash).toBeNull();
    expect(after.emailVerified).not.toBeNull();
    expect(await ctx.db.select().from(t.sessions).where(eq(t.sessions.sessionToken, s.sessionToken))).toHaveLength(0);
  });

  it("does not touch the password of an already-verified account", async () => {
    await decideGoogleSignIn(db(), { email: "member@example.com", ...verified });
    const [u] = await ctx.db.select().from(t.users).where(eq(t.users.email, "member@example.com"));
    expect(u.passwordHash).toBe("hash");
  });
});

describe("adapter account linking", () => {
  it("links a Google account to the existing user once, with no duplicate users", async () => {
    const adapter = createAdapter(db());
    const user = (await adapter.getUserByEmail!("MEMBER@example.com"))!;
    expect(user.email).toBe("member@example.com");

    await adapter.linkAccount!({ userId: user.id, type: "oidc", provider: "google", providerAccountId: "g-123" } as never);
    const byAccount = await adapter.getUserByAccount!({ provider: "google", providerAccountId: "g-123" });
    expect(byAccount?.id).toBe(user.id);

    expect(await ctx.db.select().from(t.users).where(eq(t.users.email, "member@example.com"))).toHaveLength(1);
    await expect(adapter.linkAccount!({ userId: user.id, type: "oidc", provider: "google", providerAccountId: "g-123" } as never)).rejects.toThrow();
  });

  it("never creates users on its own", async () => {
    const adapter = createAdapter(db());
    await expect(adapter.createUser!({ email: "x@example.com", emailVerified: null } as never)).rejects.toThrow(/invite-only/);
  });
});
