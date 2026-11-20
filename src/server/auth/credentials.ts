import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { SESSION_MAX_AGE } from "./session-config";
import { dummyVerify, verifyPassword } from "./password";

export type LoginResult =
  | { ok: true; userId: string; sessionToken: string; expires: Date }
  | { ok: false; reason: "invalid" | "unverified" };

export const newSessionToken = () => randomBytes(32).toString("base64url");

/** Insert a database session row (what Auth.js's database strategy reads from the cookie). */
export async function createSession(db: Db, userId: string, now = new Date()) {
  const sessionToken = newSessionToken();
  const expires = new Date(now.getTime() + SESSION_MAX_AGE * 1000);
  await db.insert(sessions).values({ userId, sessionToken, expires });
  return { sessionToken, expires };
}

/**
 * Email + password login. Every failure before the password is proven looks the same ("invalid");
 * "unverified" is only revealed to someone who knows the correct password.
 */
export async function loginWithCredentials(
  db: Db,
  input: { email: string; password: string; now?: Date },
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || !user.passwordHash) {
    await dummyVerify(input.password);
    return { ok: false, reason: "invalid" };
  }
  if (!(await verifyPassword(user.passwordHash, input.password)) || user.disabled) {
    return { ok: false, reason: "invalid" };
  }
  if (!user.emailVerified) return { ok: false, reason: "unverified" };

  const { sessionToken, expires } = await createSession(db, user.id, input.now);
  return { ok: true, userId: user.id, sessionToken, expires };
}
