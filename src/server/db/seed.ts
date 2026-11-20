import { and, eq } from "drizzle-orm";
import type { Db } from "./client";
import { bodyMetrics, commitments, profiles, users } from "./schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROGRAM_NAME = "75 Hard";

/** YYYY-MM-DD for `now` in the given IANA time zone. */
function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/**
 * Idempotent bootstrap: the OWNER user (+ profile and default body metrics rows) and one active
 * 75 Hard commitment starting today. Safe to run on every deploy.
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
      .values({ email, displayName: email.split("@")[0], role: "OWNER", emailVerified: now })
      .onConflictDoUpdate({ target: users.email, set: { role: "OWNER" } })
      .returning();

    await tx.insert(profiles).values({ userId: owner.id }).onConflictDoNothing();
    await tx.insert(bodyMetrics).values({ userId: owner.id }).onConflictDoNothing();

    const [existing] = await tx
      .select({ id: commitments.id })
      .from(commitments)
      .where(and(eq(commitments.userId, owner.id), eq(commitments.name, PROGRAM_NAME), eq(commitments.active, true)))
      .limit(1);

    let commitmentId = existing?.id;
    let createdCommitment = false;
    if (!commitmentId) {
      const [created] = await tx
        .insert(commitments)
        .values({ userId: owner.id, name: PROGRAM_NAME, startDate: localDate(now, owner.timeZone) })
        .returning({ id: commitments.id });
      commitmentId = created.id;
      createdCommitment = true;
    }

    return { ownerId: owner.id, commitmentId, createdCommitment };
  });
}
