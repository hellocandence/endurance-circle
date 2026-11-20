import { createHash, randomBytes } from "node:crypto";
import { and, eq, like, lt, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { verificationTokens } from "@/server/db/schema";

export type TokenPurpose = "verify" | "reset";

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  verify: 24 * 60 * 60 * 1000, // 24 hours
  reset: 30 * 60 * 1000, // 30 minutes (PRD F-01)
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Issue a single-use token. Only the SHA-256 hash is stored; any earlier token for the same email+purpose is revoked. */
export async function issueToken(db: Db, purpose: TokenPurpose, email: string, now = new Date()): Promise<string> {
  const identifier = `${purpose}:${email}`;
  const token = randomBytes(32).toString("base64url");
  await db.delete(verificationTokens).where(lt(verificationTokens.expires, now)); // housekeeping
  await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
  await db
    .insert(verificationTokens)
    .values({ identifier, token: hashToken(token), expires: new Date(now.getTime() + TOKEN_TTL_MS[purpose]) });
  return token;
}

/** Atomically consume a token (delete-and-return), so it works exactly once. Returns the email, or null. */
export async function consumeToken(db: Db, purpose: TokenPurpose, token: string, now = new Date()): Promise<string | null> {
  const [row] = await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.token, hashToken(token)),
        like(verificationTokens.identifier, `${purpose}:%`),
        sql`${verificationTokens.expires} > ${now.toISOString()}::timestamptz`,
      ),
    )
    .returning({ identifier: verificationTokens.identifier });
  return row ? row.identifier.slice(purpose.length + 1) : null;
}
