import NextAuth from "next-auth";
import { getDb } from "@/server/db";
import { createAdapter } from "./adapter";
import { toPublicSession } from "./public-session";
import { SESSION_MAX_AGE, SESSION_UPDATE_AGE } from "./session-config";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: "OWNER" | "MEMBER"; name: string; email: string };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: createAdapter(getDb()),
  providers: [], // Credentials (T021) and Google (T023) are added in their tasks
  session: { strategy: "database", maxAge: SESSION_MAX_AGE, updateAge: SESSION_UPDATE_AGE },
  trustHost: true, // Render terminates TLS at its proxy; AUTH_URL pins the public origin
  callbacks: {
    session: ({ session, user }) => toPublicSession(session, user) as typeof session,
  },
}));
