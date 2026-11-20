import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter } from "next-auth/adapters";
import type { Db } from "@/server/db/client";
import { accounts, sessions, users, verificationTokens } from "@/server/db/schema";

export function createAdapter(db: Db): Adapter {
  const base = DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  } as never); // our users table has no `image` column, which the adapter's default type requires

  return {
    ...base,
    // A disabled user has no session, even if a cookie issued before they were disabled still exists.
    async getSessionAndUser(sessionToken) {
      const found = await base.getSessionAndUser!(sessionToken);
      if (!found || (found.user as unknown as { disabled?: boolean }).disabled) return null;
      return found;
    },
  };
}
