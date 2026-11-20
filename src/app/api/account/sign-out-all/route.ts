import { NextResponse } from "next/server";
import { signOutEverywhere } from "@/server/auth/security";
import { sessionCookie } from "@/server/auth/session-config";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

// Ends every session of the caller on every device, including this one.
export const POST = withAuth(
  { action: "write", resource: ({ user }) => ({ kind: "profile", ownerId: user.id }) },
  async (_req, { user }) => {
    const ended = await signOutEverywhere(getDb(), user.id);
    const cookie = sessionCookie();
    const res = NextResponse.json({ ok: true, ended });
    res.cookies.set(cookie.name, "", { httpOnly: true, secure: cookie.secure, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  },
);
