import { createDb, type DbHandle } from "./client";

// Reuse one handle across Next.js dev hot reloads (a second PGlite on the same dir would conflict).
const globalForDb = globalThis as unknown as { __cadenceDb?: DbHandle };

export const { db } = (globalForDb.__cadenceDb ??= createDb());
export type { Db } from "./client";
