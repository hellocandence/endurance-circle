import { NextResponse } from "next/server";
import { z } from "zod";
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE } from "@/server/auth/invite-cookie";
import { isInviteUsable } from "@/server/auth/invites";
import { sessionCookie } from "@/server/auth/session-config";
import { getDb } from "@/server/db";
import { rejectUnsafeRequest } from "@/server/http/guards";

export const dynamic = "force-dynamic";

// Public by design (the invite token is the credential). Called by the sign-up page before it starts
// Google sign-in: validates the invite and parks it in an HttpOnly cookie for the OAuth callback.
// It does not consume the invite.
export async function POST(req: Request) {
  const unsafe = rejectUnsafeRequest(req);
  if (unsafe) return unsafe;
  const parsed = z.object({ token: z.string().min(1).max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  if (!(await isInviteUsable(getDb(), parsed.data.token))) {
    return NextResponse.json({ error: "invalid_invite" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(INVITE_COOKIE, parsed.data.token, {
    httpOnly: true,
    secure: sessionCookie().secure,
    sameSite: "lax", // must accompany Google's top-level redirect back to us
    path: "/",
    maxAge: INVITE_COOKIE_MAX_AGE,
  });
  return res;
}
