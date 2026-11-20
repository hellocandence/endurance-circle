import { createDb, type Db, type DbHandle } from "./client";

// Reuse one handle across Next.js dev hot reloads (a second PGlite on the same dir would conflict).
// Created lazily so importing this module (e.g. during `next build`) never opens a database.
const globalForDb = globalThis as unknown as { __cadenceDb?: DbHandle };

export function getDb(): Db {
  return (globalForDb.__cadenceDb ??= createDb()).db;
}
export type { Db } from "./client";
