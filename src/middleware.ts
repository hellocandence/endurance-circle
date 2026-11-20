import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE } from "@/server/auth/invite-cookie";
import { SESSION_MAX_AGE, sessionCookie } from "@/server/auth/session-config";
import { buildCsp, newNonce } from "@/server/http/security-headers";

/**
 * 1. Gives every page response a per-request CSP nonce (Next reads the nonce from the request's CSP header
 *    and stamps it on its own inline scripts).
 * 2. The invite cookie only has to survive the Google round-trip: expire it whenever the OAuth callback is
 *    hit (success or failure), so it can never be picked up by a different Google sign-in in this browser.
 *    The callback handler still sees the request cookie; this only expires it in the response.
 */
export function middleware(req: NextRequest) {
  const isCallback = req.nextUrl.pathname.startsWith("/api/auth/callback/");
  let res: NextResponse;

  if (isCallback) {
    res = NextResponse.next();
  } else {
    const nonce = newNonce();
    const csp = buildCsp(nonce);
    const headers = new Headers(req.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    res = NextResponse.next({ request: { headers } });
    res.headers.set("content-security-policy", csp);
  }

  if (req.cookies.has(INVITE_COOKIE)) res.cookies.set(INVITE_COOKIE, "", { path: "/", maxAge: 0 });

  // Rolling session: Server Components cannot set cookies, so Auth.js extends the session in the database but
  // the browser's cookie would still expire at its original date. Re-issue it with a fresh expiry on every visit.
  if (!isCallback) {
    const { name, secure } = sessionCookie();
    const token = req.cookies.get(name)?.value;
    if (token) res.cookies.set(name, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE });
  }
  return res;
}

export const config = {
  // Pages (CSP) and the OAuth callback (cookie). Not API routes, static assets, icons or the service worker.
  matcher: ["/((?!api|_next/static|_next/image|icons/|icon.png|manifest.webmanifest|sw.js|swe-worker).*)", "/api/auth/callback/:path*"],
};
