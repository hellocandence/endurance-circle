import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInvite, isInviteUsable } from "@/server/auth/invites";
import { handleSignUp } from "@/server/auth/signup-handler";
import { middleware } from "@/middleware";
import * as t from "@/server/db/schema";
import type { Email, Mailer } from "@/server/email";
import { NextRequest } from "next/server";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
const sent: Email[] = [];
const mailer: Mailer = { send: async (m) => void sent.push(m) };
let ownerId: string;
const PASSWORD = "a-long-enough-pw";

beforeAll(async () => {
  ctx = await makeTestDb();
  [{ id: ownerId }] = await ctx.db
    .insert(t.users)
    .values([
      { email: "owner@example.com", name: "Owner", role: "OWNER", emailVerified: new Date() },
      { email: "taken@example.com", name: "Taken", emailVerified: new Date() },
    ])
    .returning({ id: t.users.id });
});
afterAll(() => ctx.close());

describe("handleSignUp: no email enumeration", () => {
  it("gives the same response for a new and an already-registered email", async () => {
    const a = await createInvite(db(), ownerId);
    const b = await createInvite(db(), ownerId);
    const fresh = await handleSignUp(db(), mailer, { token: a.token, email: "fresh@example.com", password: PASSWORD, name: "F" });
    const taken = await handleSignUp(db(), mailer, { token: b.token, email: "taken@example.com", password: PASSWORD, name: "T" });
    expect(taken).toEqual(fresh);
    expect(fresh).toEqual({ status: 201, body: { ok: true } });
  });

  it("emails the existing account owner instead, and does not burn the invite", async () => {
    const { token } = await createInvite(db(), ownerId);
    sent.length = 0;
    await handleSignUp(db(), mailer, { token, email: "Taken@Example.com", password: PASSWORD, name: "T" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("taken@example.com");
    expect(sent[0].subject).toMatch(/already have/i);
    expect(await isInviteUsable(db(), token)).toBe(true);
  });

  it("new sign-ups get a verification email", async () => {
    const { token } = await createInvite(db(), ownerId);
    sent.length = 0;
    await handleSignUp(db(), mailer, { token, email: "another@example.com", password: PASSWORD, name: "A" });
    expect(sent[0].subject).toMatch(/verify/i);
  });

  it("still reports bad invites and weak passwords", async () => {
    expect((await handleSignUp(db(), mailer, { token: "bogus", email: "z@example.com", password: PASSWORD, name: "Z" })).status).toBe(400);
    const { token } = await createInvite(db(), ownerId);
    expect((await handleSignUp(db(), mailer, { token, email: "z@example.com", password: "short", name: "Z" })).body).toMatchObject({ error: "weak_password" });
  });
});

describe("invite cookie middleware", () => {
  const callback = "http://localhost:3000/api/auth/callback/google";
  it("expires the invite cookie when the OAuth callback is hit", () => {
    const res = middleware(new NextRequest(callback, { headers: { cookie: "cadence_invite=abc" } }));
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toContain("cadence_invite=;");
    expect(set.toLowerCase()).toContain("max-age=0");
  });
  it("does nothing when there is no invite cookie", () => {
    expect(middleware(new NextRequest(callback)).headers.get("set-cookie")).toBeNull();
  });
});
