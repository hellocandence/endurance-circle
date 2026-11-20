import { eq, or } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { auditLog, invites, sessions, users, verificationTokens } from "@/server/db/schema";

const baseUrl = () => (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const inviteUrl = (token: string) => `${baseUrl()}/invite/${token}`;

export const audit = (db: Pick<Db, "insert">, actorId: string, action: string, target?: string) =>
  db.insert(auditLog).values({ actorId, action, target });

export async function listMembers(db: Db) {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, disabled: users.disabled, verified: users.emailVerified, joinedAt: users.createdAt })
    .from(users)
    .orderBy(users.createdAt);
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, disabled: r.disabled, verified: r.verified !== null, joinedAt: r.joinedAt }));
}

export type RemoveResult = { ok: true; mode: "disabled" | "deleted" } | { ok: false; error: "not_found" | "is_owner" };

/**
 * Remove a member from the circle. Default: disable the account (they vanish from the circle, cannot sign
 * in, every session ends) but keep their data, so it can be undone. `permanent` also deletes everything
 * they logged. The owner can never be removed (BR2).
 */
export async function removeMember(db: Db, actorId: string, memberId: string, opts: { permanent?: boolean } = {}): Promise<RemoveResult> {
  const [member] = await db.select({ id: users.id, role: users.role, email: users.email }).from(users).where(eq(users.id, memberId)).limit(1);
  if (!member) return { ok: false, error: "not_found" };
  if (member.role === "OWNER") return { ok: false, error: "is_owner" };

  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, memberId));
    await tx.delete(verificationTokens).where(or(eq(verificationTokens.identifier, `verify:${member.email}`), eq(verificationTokens.identifier, `reset:${member.email}`)));
    if (opts.permanent) {
      // invites point at users without a cascade: keep the invite rows (history) but detach this person
      await tx.update(invites).set({ usedBy: null }).where(eq(invites.usedBy, memberId));
      await tx.update(invites).set({ createdBy: null }).where(eq(invites.createdBy, memberId));
      await tx.delete(users).where(eq(users.id, memberId)); // cascades to every table that holds their data
    }
    else await tx.update(users).set({ disabled: true }).where(eq(users.id, memberId));
    await audit(tx, actorId, opts.permanent ? "member.delete" : "member.disable", memberId);
  });
  return { ok: true, mode: opts.permanent ? "deleted" : "disabled" };
}

