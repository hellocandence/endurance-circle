import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import { getDb } from "@/server/db";
import { accounts, sessions, users, verificationTokens } from "@/server/db/schema";

export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, rolling (PRD F-01)
const SESSION_UPDATE_AGE = 24 * 60 * 60; // push expiry forward at most once a day

declare module "next-auth" {
  interface Session {
    user: { id: string; role: "OWNER" | "MEMBER"; name: string; email: string };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  } as never), // our users table has no `image` column, which the adapter's default type requires
  providers: [], // Credentials (T021) and Google (T023) are added in their tasks
  session: { strategy: "database", maxAge: SESSION_MAX_AGE, updateAge: SESSION_UPDATE_AGE },
  trustHost: true, // Render terminates TLS at its proxy; AUTH_URL pins the public origin
  callbacks: {
    // The adapter returns the whole users row (incl. password_hash): expose only safe fields.
    session({ session, user }) {
      const u = user as unknown as { id: string; role: "OWNER" | "MEMBER"; name: string; email: string };
      return { ...session, user: { id: u.id, role: u.role, name: u.name, email: u.email } as typeof session.user };
    },
  },
}));
