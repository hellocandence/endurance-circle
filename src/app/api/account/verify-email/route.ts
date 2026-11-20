import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEmail } from "@/server/auth/account";
import { getDb } from "@/server/db";
import { rejectUnsafeRequest } from "@/server/http/guards";

export const dynamic = "force-dynamic";

// Public by design (the token is the credential). POST, not GET, so mail scanners cannot burn the link.
export async function POST(req: Request) {
  const unsafe = rejectUnsafeRequest(req);
  if (unsafe) return unsafe;
  const parsed = z.object({ token: z.string().min(1).max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const ok = await verifyEmail(getDb(), parsed.data.token);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "invalid_token" }, { status: 400 });
}
