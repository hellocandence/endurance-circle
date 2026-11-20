import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as t from "@/server/db/schema";
import { getProfile, profilePatchSchema, updateProfile } from "@/server/profile/service";
import { makeTestDb } from "./helpers/db";

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
const db = () => ctx.db as never;
let aliceId: string;
let bobId: string;

beforeAll(async () => {
  ctx = await makeTestDb();
  const rows = await ctx.db.insert(t.users).values([{ email: "alice@example.com", name: "Alice" }, { email: "bob@example.com", name: "Bob" }]).returning({ id: t.users.id });
  [aliceId, bobId] = rows.map((r) => r.id);
});
afterAll(() => ctx.close());

describe("profilePatchSchema", () => {
  it("accepts partial valid updates", () => {
    expect(profilePatchSchema.safeParse({ name: "  New Name ", timeZone: "Asia/Kolkata", bio: null }).data).toEqual({ name: "New Name", timeZone: "Asia/Kolkata", bio: null });
    expect(profilePatchSchema.safeParse({}).success).toBe(true);
  });
  it("rejects unknown time zones, empty names and long text", () => {
    for (const bad of [{ timeZone: "Mars/Olympus" }, { timeZone: "" }, { name: "   " }, { name: "x".repeat(81) }, { bio: "x".repeat(281) }]) {
      expect(profilePatchSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it("rejects privilege-escalation and foreign fields (mass assignment)", () => {
    for (const field of ["role", "email", "disabled", "passwordHash", "emailVerified", "id", "userId"]) {
      expect(profilePatchSchema.safeParse({ [field]: field === "disabled" ? false : "OWNER" }).success, field).toBe(false);
    }
  });
});

describe("updateProfile", () => {
  it("updates only the targeted user", async () => {
    const out = await updateProfile(db(), aliceId, { name: "Alice B", timeZone: "Europe/London", bio: "Runner" });
    expect(out).toMatchObject({ name: "Alice B", timeZone: "Europe/London", bio: "Runner", role: "MEMBER" });
    expect(await getProfile(db(), bobId)).toMatchObject({ name: "Bob", timeZone: "Asia/Kolkata", bio: null });
  });
  it("partial updates leave other fields alone, and bio can be cleared", async () => {
    await updateProfile(db(), aliceId, { bio: null });
    expect(await getProfile(db(), aliceId)).toMatchObject({ name: "Alice B", timeZone: "Europe/London", bio: null });
  });
  it("never changes role or email", async () => {
    const [row] = await ctx.db.select().from(t.users).where(eq(t.users.id, aliceId));
    expect(row).toMatchObject({ role: "MEMBER", email: "alice@example.com" });
  });
  it("returns null for an unknown user", async () => {
    expect(await updateProfile(db(), "00000000-0000-4000-8000-000000000000", { name: "x" })).toBeNull();
  });
});
