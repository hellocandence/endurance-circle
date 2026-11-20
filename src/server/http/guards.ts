import { NextResponse } from "next/server";

/**
 * CSRF defence for public, state-changing JSON routes (login, password reset, ...), which have no
 * session for Auth.js's CSRF token to protect. Cross-site pages could otherwise POST a `text/plain`
 * body that parses as JSON (login CSRF: signing a victim into the attacker's account).
 * Returns a 4xx response to send, or null if the request may proceed.
 */
export function rejectUnsafeRequest(req: Request, env: Record<string, string | undefined> = process.env): NextResponse | null {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }

  const origin = req.headers.get("origin");
  if (origin) {
    let allowed: string;
    try {
      allowed = env.AUTH_URL
        ? new URL(env.AUTH_URL).origin
        : `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;
    } catch {
      allowed = "";
    }
    if (origin !== allowed) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }
  return null;
}
