import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "@/server/db/client";
import { accounts, auditLog, bodyMetrics, commitments, dailyLogs, invites, journalEntries, profilePhotos, profiles, sessions, users, verificationTokens } from "@/server/db/schema";

/**
 * Challenge-related tables, in delete order (logs reference programmes). daily_logs holds every per-day record
 * (tasks done, misses, streak inputs, notes); commitments holds each programme, active or retired.
 */
const CHALLENGE = { dailyLogs, commitments } as const;

/** Everything else is left alone, and the reset refuses to commit if any of these change. */
const PROTECTED = { users, accounts, sessions, verificationTokens, invites, profiles, profilePhotos, bodyMetrics, journalEntries, auditLog } as const;

type Counts = Record<string, number>;

async function countAll(db: Pick<Db, "select">, tables: Record<string, PgTable>) {
  const out: Counts = {};
  for (const [name, table] of Object.entries(tables)) {
    const [row] = await db.select({ n: count() }).from(table);
    out[name] = Number(row.n);
  }
  return out;
}

/** Rows per member, for the dry-run report (names only, no emails). */
export async function perMember(db: Db) {
  const rows = await db.select({ id: users.id, name: users.name }).from(users).orderBy(users.createdAt);
  const out: { name: string | null; programmes: number; logs: number }[] = [];
  for (const u of rows) {
    const [p] = await db.select({ n: count() }).from(commitments).where(eq(commitments.userId, u.id));
    const [l] = await db.select({ n: count() }).from(dailyLogs).where(eq(dailyLogs.userId, u.id));
    out.push({ name: u.name, programmes: Number(p.n), logs: Number(l.n) });
  }
  return out;
}

export type ResetReport = { applied: boolean; challengeBefore: Counts; challengeAfter: Counts; protectedBefore: Counts; protectedAfter: Counts };

/**
 * Remove every member's challenge data (all programmes and all daily logs). Accounts, sign-in data, profiles,
 * photos and body limits are not touched. Without `apply` it only reports. With it, everything happens in one
 * transaction that is rolled back if any protected table's row count differs afterwards.
 */
export async function resetChallengeData(db: Db, opts: { apply: boolean }): Promise<ResetReport> {
  const challengeBefore = await countAll(db, CHALLENGE);
  const protectedBefore = await countAll(db, PROTECTED);
  if (!opts.apply) return { applied: false, challengeBefore, challengeAfter: challengeBefore, protectedBefore, protectedAfter: protectedBefore };

  class Mismatch extends Error {}
  try {
    return await db.transaction(async (tx) => {
      await tx.delete(dailyLogs);
      await tx.delete(commitments);
      const challengeAfter = await countAll(tx as unknown as Db, CHALLENGE);
      const protectedAfter = await countAll(tx as unknown as Db, PROTECTED);
      if (Object.values(challengeAfter).some((n) => n !== 0) || Object.keys(protectedBefore).some((k) => protectedBefore[k] !== protectedAfter[k])) throw new Mismatch("row counts do not match expectations");
      await tx.insert(auditLog).values({ action: "challenge.data_reset", target: `programmes=${challengeBefore.commitments} logs=${challengeBefore.dailyLogs}` });
      protectedAfter.auditLog += 1; // the one row this reset adds
      return { applied: true, challengeBefore, challengeAfter, protectedBefore, protectedAfter };
    });
  } catch (e) {
    if (e instanceof Mismatch) throw new Error("Reset rolled back: protected tables changed or challenge tables not empty");
    throw e;
  }
}
