import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { describe, expect, it } from "vitest";
import { createDb } from "@/server/db/client";

describe("createDb", () => {
  it("fails closed in production without DATABASE_URL", () => {
    expect(() => createDb({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });

  it("uses real Postgres when DATABASE_URL is set", async () => {
    const handle = createDb({ DATABASE_URL: "postgres://u:p@localhost:5432/x" });
    expect(handle.kind).toBe("postgres");
    await handle.close(); // pool is lazy, so nothing was connected
  });
});

describe("PGlite dev database", () => {
  it("supports the pgvector extension (needed by migration 0001)", async () => {
    const pg = new PGlite({ extensions: { vector } });
    await pg.exec("CREATE EXTENSION IF NOT EXISTS vector;");
    const res = await pg.query<{ extname: string }>("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    expect(res.rows).toHaveLength(1);
    await pg.close();
  });
});
