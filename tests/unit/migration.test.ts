import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TABLES = [
  "accounts",
  "audit_log",
  "body_metrics",
  "commitments",
  "daily_logs",
  "invites",
  "journal_entries",
  "profile_photos",
  "profiles",
  "sessions",
  "users",
  "verification_tokens",
];

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite({ extensions: { vector } });
  await migrate(drizzle(pg), { migrationsFolder: "drizzle" });
});
afterAll(() => pg.close());

const user = async (email: string) =>
  (await pg.query<{ id: string }>("INSERT INTO users (email, display_name) VALUES ($1, 'x') RETURNING id", [email]))
    .rows[0].id;

describe("migration 0001", () => {
  it("enables the vector extension", async () => {
    const r = await pg.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    expect(r.rows).toHaveLength(1);
  });

  it("creates every table in the data model", async () => {
    const r = await pg.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    expect(r.rows.map((x) => x.tablename)).toEqual(TABLES);
  });

  it("applies defaults: MEMBER role, Asia/Kolkata, not disabled", async () => {
    const id = await user("a@example.com");
    const r = await pg.query("SELECT role, time_zone, disabled FROM users WHERE id = $1", [id]);
    expect(r.rows[0]).toEqual({ role: "MEMBER", time_zone: "Asia/Kolkata", disabled: false });
  });

  it("enforces unique email", async () => {
    await user("dup@example.com");
    await expect(user("dup@example.com")).rejects.toThrow();
  });

  it("limits study_min_target to 60..90", async () => {
    const id = await user("b@example.com");
    await expect(pg.query("INSERT INTO body_metrics (user_id, study_min_target) VALUES ($1, 59)", [id])).rejects.toThrow();
    await expect(pg.query("INSERT INTO body_metrics (user_id, study_min_target) VALUES ($1, 91)", [id])).rejects.toThrow();
    await pg.query("INSERT INTO body_metrics (user_id, study_min_target) VALUES ($1, 75)", [id]);
  });

  it("rejects photos over 300 KB", async () => {
    const id = await user("c@example.com");
    const insert = (n: number) =>
      pg.query("INSERT INTO profile_photos (user_id, width, height, bytes) VALUES ($1, 512, 512, $2)", [
        id,
        new Uint8Array(n),
      ]);
    await expect(insert(307201)).rejects.toThrow();
    await insert(307200);
  });

  it("restricts journal visibility and allows a null embedding", async () => {
    const id = await user("d@example.com");
    await expect(
      pg.query("INSERT INTO journal_entries (user_id, body, visibility) VALUES ($1, 'b', 'FRIENDS')", [id]),
    ).rejects.toThrow();
    await pg.query("INSERT INTO journal_entries (user_id, body, visibility) VALUES ($1, 'b', 'PRIVATE')", [id]);
  });

  it("allows one daily log per user, commitment and date", async () => {
    const id = await user("e@example.com");
    const c = (
      await pg.query<{ id: string }>("INSERT INTO commitments (user_id, start_date) VALUES ($1, '2026-11-20') RETURNING id", [id])
    ).rows[0].id;
    const log = () =>
      pg.query(
        "INSERT INTO daily_logs (user_id, commitment_id, log_date, day_number, is_sunday) VALUES ($1, $2, '2026-11-20', 1, false)",
        [id, c],
      );
    await log();
    await expect(log()).rejects.toThrow();
    const r = await pg.query<{ missed_tasks: string[] }>("SELECT missed_tasks FROM daily_logs WHERE user_id = $1", [id]);
    expect(r.rows[0].missed_tasks).toEqual([]);
  });

  it("cascades member data on user delete", async () => {
    const id = await user("f@example.com");
    await pg.query("INSERT INTO body_metrics (user_id) VALUES ($1)", [id]);
    await pg.query("DELETE FROM users WHERE id = $1", [id]);
    const r = await pg.query("SELECT 1 FROM body_metrics WHERE user_id = $1", [id]);
    expect(r.rows).toHaveLength(0);
  });
});
