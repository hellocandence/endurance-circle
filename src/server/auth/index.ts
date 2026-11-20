import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/server/db";
import { createAdapter } from "./adapter";
import { decideGoogleSignIn } from "./google";
import { toPublicSession } from "./public-session";
import { SESSION_MAX_AGE, SESSION_UPDATE_AGE } from "./session-config";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: "OWNER" | "MEMBER"; name: string; email: string };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: createAdapter(getDb()),
  // Email + password login is our own /api/login (T021). Google is enabled only when configured.
  providers:
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            allowDangerousEmailAccountLinking: true, // safe only because signIn below requires a verified Google email
          }),
        ]
      : [],
  session: { strategy: "database", maxAge: SESSION_MAX_AGE, updateAge: SESSION_UPDATE_AGE },
  trustHost: true, // Render terminates TLS at its proxy; AUTH_URL pins the public origin
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false; // no other Auth.js provider is allowed to sign in
      return decideGoogleSignIn(getDb(), { email: profile?.email, email_verified: profile?.email_verified });
    },
    session: ({ session, user }) => toPublicSession(session, user) as typeof session,
  },
}));
