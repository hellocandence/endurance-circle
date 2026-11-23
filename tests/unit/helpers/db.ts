import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import type { Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";

/** The raw-SQL handle both engines share (what PGlite and a pg Pool both offer). */
export type RawSql = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
};
export type TestDb = { pg: RawSql; db: Db; close: () => Promise<void> };

/**
 * A fresh, fully migrated database. By default an in-memory Postgres (PGlite). With TEST_DATABASE_URL set it
 * is a throwaway database on a REAL Postgres server (created and dropped per call), so the whole suite can be
 * run against the same engine as production (CI runs both).
 */
export async function makeTestDb(): Promise<TestDb> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  return adminUrl ? makeRealDb(adminUrl) : makePglite();
}

async function makePglite(): Promise<TestDb> {
  const pg = new PGlite({ extensions: { vector } });
  const db = drizzlePglite(pg, { schema });
  await migratePglite(db, { migrationsFolder: "drizzle" });
  return { pg, db: db as unknown as Db, close: () => pg.close() };
}

async function makeRealDb(adminUrl: string): Promise<TestDb> {
  const name = `endurance_circle_test_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  admin.on("error", () => {});
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 3 });
  pool.on("error", () => {}); // DROP DATABASE ... WITH (FORCE) at teardown can sever a connection that is still closing
  const db = drizzlePg(pool, { schema });
  await migratePg(db, { migrationsFolder: "drizzle" });
  return {
    pg: { query: (sql, params) => pool.query(sql, params as never[]) as never, exec: (sql) => pool.query(sql) },
    db: db as unknown as Db,
    close: async () => {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
