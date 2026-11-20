import { NextResponse } from "next/server";
import { endSession } from "@/server/auth/security";
import { sessionCookie } from "@/server/auth/session-config";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

// Ends the session of THIS device only. (sign-out-all ends every device.)
export const POST = withAuth(
  { action: "write", resource: ({ user }) => ({ kind: "profile", ownerId: user.id }) },
  async (req, { user }) => {
    const cookie = sessionCookie();
    const token = req.headers.get("cookie")?.split(";").map((c) => c.trim().split("=")).find(([k]) => k === cookie.name)?.[1];
    if (token) await endSession(getDb(), user.id, decodeURIComponent(token));
    const res = NextResponse.json({ ok: true });
    res.cookies.set(cookie.name, "", { httpOnly: true, secure: cookie.secure, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  },
);
