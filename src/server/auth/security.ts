import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

export type ChangePasswordResult =
  | { ok: true; signedOutOthers: number }
  | { ok: false; reason: "wrong_password" | "weak_password" | "same_password" | "no_password"; message?: string };

/**
 * Change the signed-in member's password. Requires the current password (a stolen session alone is not
 * enough). Every OTHER session is ended; the current one (`keepSessionToken`) stays signed in.
 * Accounts without a password (Google-only) must use the email reset flow to set one.
 */
export async function changePassword(
  db: Db,
  userId: string,
  input: { currentPassword: string; newPassword: string; keepSessionToken?: string | null },
): Promise<ChangePasswordResult> {
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.passwordHash) return { ok: false, reason: "no_password" };

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) return { ok: false, reason: "wrong_password" };
  const problem = passwordProblem(input.newPassword);
  if (problem) return { ok: false, reason: "weak_password", message: problem };
  if (input.newPassword === input.currentPassword) return { ok: false, reason: "same_password" };

  await db.update(users).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(users.id, userId));
  const others = await db
    .delete(sessions)
    .where(input.keepSessionToken ? and(eq(sessions.userId, userId), ne(sessions.sessionToken, input.keepSessionToken)) : eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return { ok: true, signedOutOthers: others.length };
}

/** End every session the member has, on every device (including this one). */
export async function signOutEverywhere(db: Db, userId: string): Promise<number> {
  const gone = await db.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id });
  return gone.length;
}
