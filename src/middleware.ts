import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE } from "@/server/auth/invite-cookie";

/**
 * The invite cookie only has to survive the Google round-trip. Clear it whenever the OAuth callback is
 * hit (success or failure), so it can never be picked up by a different Google sign-in in this browser.
 * The callback handler still sees the request cookie; this only expires it in the response.
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (req.cookies.has(INVITE_COOKIE)) {
    res.cookies.set(INVITE_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return res;
}

export const config = { matcher: ["/api/auth/callback/:path*"] };
