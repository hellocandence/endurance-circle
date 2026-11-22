import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { seed } from "@/server/db/seed";
import { makeTestDb, type RawSql } from "./helpers/db";

let pg: RawSql;
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  const ctx = await makeTestDb(); // PGlite by default, a real Postgres when TEST_DATABASE_URL is set
  ({ pg, db, close } = ctx);
});
afterAll(() => close());

const count = async (table: string) =>
  Number((await pg.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

describe("seed", () => {
  const now = new Date("2026-11-20T20:00:00Z"); // already 2026-11-21 in Asia/Kolkata

  it("creates the owner, profile and body metrics, and no programme (the owner starts from Today like everyone)", async () => {
    await seed(db, { ownerEmail: "  Owner@Example.com ", now });

    const owner = (await pg.query("SELECT email, role, display_name, email_verified_at, password_hash FROM users")).rows[0] as Record<string, unknown>;
    expect(owner).toMatchObject({ email: "owner@example.com", role: "OWNER", display_name: "owner", password_hash: null });
    expect(owner.email_verified_at).not.toBeNull();

    expect(await count("commitments")).toBe(0);
    expect(await count("profiles")).toBe(1);
    expect(await count("body_metrics")).toBe(1);
  });

  it("is idempotent", async () => {
    await seed(db, { ownerEmail: "owner@example.com", now: new Date("2026-12-01T00:00:00Z") });
    expect(await count("users")).toBe(1);
    expect(await count("commitments")).toBe(0);
    expect(await count("profiles")).toBe(1);
    expect(await count("body_metrics")).toBe(1);
  });

  it("promotes an existing member with that email without changing their name", async () => {
    await pg.query("INSERT INTO users (email, display_name) VALUES ('m@example.com', 'Maya')");
    await seed(db, { ownerEmail: "m@example.com", now });
    const r = (await pg.query("SELECT role, display_name FROM users WHERE email = 'm@example.com'")).rows[0];
    expect(r).toEqual({ role: "OWNER", display_name: "Maya" });
  });

  it("rejects a missing or invalid OWNER_EMAIL", async () => {
    await expect(seed(db, { ownerEmail: "" })).rejects.toThrow(/OWNER_EMAIL/);
    await expect(seed(db, { ownerEmail: "not-an-email" })).rejects.toThrow(/OWNER_EMAIL/);
  });
});
