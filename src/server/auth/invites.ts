import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { invites, users } from "@/server/db/schema";
import type { Mailer } from "@/server/email";
import { createMemberRow, sendVerification } from "./account";
import { hashPassword, passwordProblem } from "./password";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // BR1

const hashInvite = (token: string) => createHash("sha256").update(token).digest("hex");
const usable = (now: Date) => and(isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now));

/** Owner only (checked here as defence in depth; routes also go through the RBAC guard). */
export async function createInvite(db: Db, createdBy: string, now = new Date()) {
  const [actor] = await db.select({ role: users.role, disabled: users.disabled }).from(users).where(eq(users.id, createdBy)).limit(1);
  if (!actor || actor.disabled || actor.role !== "OWNER") throw new Error("Only the owner can create invites");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const [row] = await db.insert(invites).values({ tokenHash: hashInvite(token), createdBy, expiresAt }).returning({ id: invites.id });
  return { id: row.id, token, expiresAt };
}

export async function revokeInvite(db: Db, inviteId: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(invites)
    .set({ revokedAt: now })
    .where(and(eq(invites.id, inviteId), isNull(invites.usedAt), isNull(invites.revokedAt)))
    .returning({ id: invites.id });
  return rows.length > 0;
}

export type InviteStatus = "pending" | "used" | "revoked" | "expired";

export async function listInvites(db: Db, now = new Date()) {
  const rows = await db.select().from(invites).orderBy(desc(invites.createdAt));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    usedBy: r.usedBy,
    status: (r.usedAt ? "used" : r.revokedAt ? "revoked" : r.expiresAt <= now ? "expired" : "pending") as InviteStatus,
  }));
}

/** Read-only check (does not consume). */
export async function isInviteUsable(db: Db, token: string, now = new Date()): Promise<boolean> {
  const [row] = await db.select({ id: invites.id }).from(invites).where(and(eq(invites.tokenHash, hashInvite(token)), usable(now))).limit(1);
  return !!row;
}

class Rollback extends Error {
  constructor(readonly reason: "invalid_invite" | "email_taken") {
    super(reason);
  }
}

type Member = { email: string; name: string; passwordHash: string | null; emailVerified: Date | null };

/**
 * Claim the invite and create the member in ONE transaction: the claim is a conditional UPDATE, so of
 * two concurrent attempts only one wins, and a failure (e.g. email taken) rolls the claim back.
 */
async function claimInviteAndCreate(db: Db, token: string, member: Member, now: Date) {
  try {
    return await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(invites)
        .set({ usedAt: now })
        .where(and(eq(invites.tokenHash, hashInvite(token)), usable(now)))
        .returning({ id: invites.id });
      if (!claimed) throw new Rollback("invalid_invite");

      const userId = await createMemberRow(tx, member);
      if (!userId) throw new Rollback("email_taken");

      await tx.update(invites).set({ usedBy: userId }).where(eq(invites.id, claimed.id));
      return { ok: true as const, userId };
    });
  } catch (err) {
    if (err instanceof Rollback) return { ok: false as const, reason: err.reason };
    throw err;
  }
}

export type SignUpResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid_invite" | "email_taken" | "weak_password"; message?: string };

/** Email + password sign-up. Requires a valid invite (BR1); emails a verification link. */
export async function signUpWithInvite(
  db: Db,
  mailer: Mailer,
  input: { token: string; email: string; password: string; name: string; now?: Date },
): Promise<SignUpResult> {
  const problem = passwordProblem(input.password); // before touching the invite, so a typo does not burn it
  if (problem) return { ok: false, reason: "weak_password", message: problem };

  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  const result = await claimInviteAndCreate(db, input.token, { email, name: input.name, passwordHash: await hashPassword(input.password), emailVerified: null }, now);
  if (result.ok) await sendVerification(db, mailer, email, now);
  return result;
}

/** Google sign-up for a new person: needs a valid invite; Google has verified the email already. */
export async function signUpWithInviteViaGoogle(db: Db, input: { token: string; email: string; name: string; now?: Date }) {
  const now = input.now ?? new Date();
  const result = await claimInviteAndCreate(
    db,
    input.token,
    { email: input.email.trim().toLowerCase(), name: input.name, passwordHash: null, emailVerified: now },
    now,
  );
  return result.ok;
}

