import type { Db } from "./client";
import { bodyMetrics, profiles, users } from "./schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Idempotent bootstrap: the OWNER user (+ profile and default body metrics rows). Safe to run on every deploy.
 * It never creates a programme: the owner begins the challenge from Today like everyone else, and a reset of
 * challenge data must not be undone by the next deploy.
 */
export async function seed(db: Db, opts: { ownerEmail: string; now?: Date }) {
  const email = opts.ownerEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("OWNER_EMAIL is missing or not a valid email");
  const now = opts.now ?? new Date();

  return db.transaction(async (tx) => {
    // Whoever runs the seed controls the server, so the owner's email is treated as verified.
    // No password is set: the owner signs in with Google or the password-reset flow.
    const [owner] = await tx
      .insert(users)
      .values({ email, name: email.split("@")[0], role: "OWNER", emailVerified: now })
      .onConflictDoUpdate({ target: users.email, set: { role: "OWNER" } })
      .returning();

    await tx.insert(profiles).values({ userId: owner.id }).onConflictDoNothing();
    await tx.insert(bodyMetrics).values({ userId: owner.id }).onConflictDoNothing();

    return { ownerId: owner.id };
  });
}
