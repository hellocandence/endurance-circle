import { NextResponse } from "next/server";
import { z } from "zod";
import { loginWithCredentials } from "@/server/auth/credentials";
import { sessionCookie } from "@/server/auth/session-config";
import { PASSWORD_MAX } from "@/server/auth/password";
import { getDb } from "@/server/db";
import { rejectUnsafeRequest } from "@/server/http/guards";
import { limits } from "@/server/http/limits";
import { clientIp, enforce, enforcePeek } from "@/server/http/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(PASSWORD_MAX) });

// Public by design: this is how a session is obtained. Rate limiting is added in T025.
export async function POST(req: Request) {
  const unsafe = rejectUnsafeRequest(req);
  if (unsafe) return unsafe;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const ip = clientIp(req);
  const email = parsed.data.email.trim().toLowerCase();
  const pairKey = `${ip}|${email}`;
  // Per-IP counts every request (cheap abuse guard). The per-account limits count FAILURES only, so
  // someone's successful logins never lock them out (they are checked first, recorded after a failure).
  const limited = enforce([[limits.loginIp, ip]]) ?? enforcePeek([[limits.loginIpEmail, pairKey], [limits.loginEmail, email]]);
  if (limited) return limited;

  const result = await loginWithCredentials(getDb(), parsed.data);
  if (!result.ok) {
    if (result.reason === "invalid") {
      // "unverified" means the password was right, so it is not a guessing attempt
      limits.loginIpEmail.record(pairKey);
      limits.loginEmail.record(email);
    }
    return result.reason === "unverified"
      ? NextResponse.json({ error: "email_not_verified" }, { status: 403 })
      : NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  limits.loginIpEmail.reset(pairKey); // a correct password clears this address's failures for that account
  const res = NextResponse.json({ ok: true });
  const cookie = sessionCookie();
  res.cookies.set(cookie.name, result.sessionToken, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: "lax",
    path: "/",
    expires: result.expires,
  });
  return res;
}
