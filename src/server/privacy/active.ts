import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import type { Actor } from "@/server/rbac/can";

/**
 * Reads are open inside the circle (T104), but the circle is only its active members: the same rule as the
 * Circle feed (`loadCircle`), not disabled and email confirmed. A removed or unconfirmed member's data is
 * visible to themself and the owner only. Call this in every read handler that takes a member id from the URL.
 */
export async function canViewMember(db: Db, actor: Actor, memberId: string): Promise<boolean> {
  if (actor.role === "OWNER" || actor.id === memberId) return true;
  const [row] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, memberId), eq(users.disabled, false), isNotNull(users.emailVerified))).limit(1);
  return !!row;
}
