import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbHandle =
  | { kind: "postgres"; db: Db; pool: Pool; close: () => Promise<void> }
  | { kind: "pglite"; db: Db; client: PGlite; close: () => Promise<void> };

/** Local dev data (gitignored). Used only when DATABASE_URL is not set. */
export const PGLITE_DIR = ".data/pglite";

/**
 * Real Postgres when DATABASE_URL is set, otherwise embedded PGlite (dev only).
 * Production must never fall back to PGlite, so it fails closed.
 */
type DbEnv = { DATABASE_URL?: string; NODE_ENV?: string };

export function createDb(env: DbEnv = process.env): DbHandle {
  const url = env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url });
    return { kind: "postgres", db: drizzlePg(pool, { schema }), pool, close: () => pool.end() };
  }
  if (env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }
  mkdirSync(PGLITE_DIR, { recursive: true });
  const client = new PGlite(PGLITE_DIR, { extensions: { vector } });
  return { kind: "pglite", db: drizzlePglite(client, { schema }), client, close: () => client.close() };
}
