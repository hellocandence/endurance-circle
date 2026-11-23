import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as t from "@/server/db/schema";
import { canViewMember } from "@/server/privacy/active";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
const ids: Record<string, string> = {};

beforeAll(async () => {
  ctx = await makeTestDb();
  const now = new Date();
  const rows = await ctx.db.insert(t.users).values([
    { email: "owner@example.com", name: "Owner", role: "OWNER", emailVerified: now },
    { email: "active@example.com", name: "Active", emailVerified: now },
    { email: "viewer@example.com", name: "Viewer", emailVerified: now },
    { email: "removed@example.com", name: "Removed", emailVerified: now, disabled: true },
    { email: "unconfirmed@example.com", name: "Unconfirmed" },
  ]).returning({ id: t.users.id, name: t.users.name });
  for (const r of rows) ids[r.name] = r.id;
});
afterAll(() => ctx.close());

describe("canViewMember (open circle, active members only)", () => {
  const viewer = () => ({ id: ids.Viewer, role: "MEMBER" as const });
  it("a member can view an active confirmed member", async () => expect(await canViewMember(db(), viewer(), ids.Active)).toBe(true));
  it("a member cannot view a removed or unconfirmed member, or an unknown id", async () => {
    expect(await canViewMember(db(), viewer(), ids.Removed)).toBe(false);
    expect(await canViewMember(db(), viewer(), ids.Unconfirmed)).toBe(false);
    expect(await canViewMember(db(), viewer(), "00000000-0000-4000-8000-000000000000")).toBe(false);
  });
  it("the owner and the member themself can always view", async () => {
    expect(await canViewMember(db(), { id: ids.Owner, role: "OWNER" }, ids.Removed)).toBe(true);
    expect(await canViewMember(db(), { id: ids.Removed, role: "MEMBER" }, ids.Removed)).toBe(true);
  });
});
