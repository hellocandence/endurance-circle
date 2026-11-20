import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";

/**
 * Decide whether a Google sign-in may proceed. Auth.js then links the Google account to the user
 * with the same email (allowDangerousEmailAccountLinking), which is only safe because of these checks.
 *
 * - Google must say the email is verified.
 * - Only existing, enabled users may sign in (sign-up is invite-only, BR1; T024 adds the invite path).
 * - If that user was created by password sign-up and never verified, whoever set the password never
 *   proved the inbox. Wipe it and its sessions, otherwise they could keep access after the real owner links Google.
 */
export async function decideGoogleSignIn(
  db: Db,
  profile: { email?: string | null; email_verified?: boolean | null },
  now = new Date(),
): Promise<boolean> {
  if (!profile.email || profile.email_verified !== true) return false;

  const [user] = await db.select().from(users).where(eq(users.email, profile.email.trim().toLowerCase())).limit(1);
  if (!user || user.disabled) return false;

  if (!user.emailVerified) {
    await db.update(users).set({ passwordHash: null, emailVerified: now }).where(eq(users.id, user.id));
    await db.delete(sessions).where(eq(sessions.userId, user.id));
  }
  return true;
}
