import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { bodyMetrics, profiles, sessions, users } from "@/server/db/schema";
import type { Mailer } from "@/server/email";
import { hashPassword, passwordProblem } from "./password";
import { consumeToken, issueToken } from "./tokens";

const baseUrl = () => (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
const normalize = (email: string) => email.trim().toLowerCase();

type DbOrTx = Pick<Db, "insert">;

/** Insert a MEMBER with its profile and default body-metrics rows. Null if the email is taken. */
export async function createMemberRow(
  db: DbOrTx,
  input: { email: string; name: string; passwordHash: string | null; emailVerified?: Date | null },
): Promise<string | null> {
  const [created] = await db
    .insert(users)
    .values({
      email: normalize(input.email),
      name: input.name.trim(),
      passwordHash: input.passwordHash,
      emailVerified: input.emailVerified ?? null,
      role: "MEMBER",
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (!created) return null;
  await db.insert(profiles).values({ userId: created.id });
  await db.insert(bodyMetrics).values({ userId: created.id });
  return created.id;
}

export async function sendVerification(db: Db, mailer: Mailer, email: string, now?: Date) {
  const token = await issueToken(db, "verify", email, now);
  await mailer.send({
    to: email,
    subject: "Verify your Cadence email",
    text: `Welcome to Cadence.\n\nConfirm your email: ${baseUrl()}/verify?token=${token}\n\nThis link works once and expires in 24 hours.`,
  });
}

/**
 * Create an unverified member and email a verification link.
 * INTERNAL: never call this from a public route without first checking an invite (BR1, T024).
 */
export async function registerUser(
  db: Db,
  mailer: Mailer,
  input: { email: string; password: string; name: string; now?: Date },
): Promise<{ ok: true; userId: string } | { ok: false; reason: "weak_password" | "email_taken"; message?: string }> {
  const problem = passwordProblem(input.password);
  if (problem) return { ok: false, reason: "weak_password", message: problem };

  const email = normalize(input.email);
  const userId = await createMemberRow(db, { email, name: input.name, passwordHash: await hashPassword(input.password) });
  if (!userId) return { ok: false, reason: "email_taken" };
  await sendVerification(db, mailer, email, input.now);
  return { ok: true, userId };
}

/** Always resolves the same way, so it cannot be used to discover which emails have accounts. */
export async function resendVerification(db: Db, mailer: Mailer, rawEmail: string, now?: Date) {
  const email = normalize(rawEmail);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user && !user.emailVerified && !user.disabled) await sendVerification(db, mailer, email, now);
}

export async function verifyEmail(db: Db, token: string, now = new Date()): Promise<boolean> {
  const email = await consumeToken(db, "verify", token, now);
  if (!email) return false;
  await db.update(users).set({ emailVerified: now }).where(eq(users.email, email));
  return true;
}

/** Always resolves the same way (no account enumeration). Only real, enabled accounts get an email. */
export async function requestPasswordReset(db: Db, mailer: Mailer, rawEmail: string, now?: Date) {
  const email = normalize(rawEmail);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.disabled) return;
  const token = await issueToken(db, "reset", email, now);
  await mailer.send({
    to: email,
    subject: "Reset your Cadence password",
    text: `Reset your password: ${baseUrl()}/reset?token=${token}\n\nThis link works once and expires in 30 minutes. If you did not ask for it, ignore this email.`,
  });
}

export async function resetPassword(
  db: Db,
  input: { token: string; password: string; now?: Date },
): Promise<{ ok: true } | { ok: false; reason: "weak_password" | "invalid_token"; message?: string }> {
  const problem = passwordProblem(input.password);
  if (problem) return { ok: false, reason: "weak_password", message: problem }; // checked first so a typo does not burn the token

  const now = input.now ?? new Date();
  const email = await consumeToken(db, "reset", input.token, now);
  if (!email) return { ok: false, reason: "invalid_token" };

  const [user] = await db.select({ id: users.id, emailVerified: users.emailVerified }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return { ok: false, reason: "invalid_token" };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.password), emailVerified: user.emailVerified ?? now }) // the link proved control of the inbox
    .where(eq(users.id, user.id));
  await db.delete(sessions).where(eq(sessions.userId, user.id)); // sign out everywhere
  return { ok: true };
}

/** Sent instead of revealing "email already registered" to whoever filled in the sign-up form. */
export async function notifyAlreadyRegistered(mailer: Mailer, email: string) {
  await mailer.send({
    to: normalize(email),
    subject: "You already have a Cadence account",
    text: `Someone used an invite to sign up with this email, but it already has a Cadence account.\n\nSign in: ${baseUrl()}/login\nForgot your password? ${baseUrl()}/forgot\n\nIf this was not you, you can ignore this email.`,
  });
}
