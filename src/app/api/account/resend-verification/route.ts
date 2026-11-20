import { NextResponse } from "next/server";
import { z } from "zod";
import { resendVerification } from "@/server/auth/account";
import { getDb } from "@/server/db";
import { rejectUnsafeRequest } from "@/server/http/guards";
import { getMailer } from "@/server/email";

export const dynamic = "force-dynamic";

// Public by design. Same response whether or not the email has an account. Rate limiting: T025.
export async function POST(req: Request) {
  const unsafe = rejectUnsafeRequest(req);
  if (unsafe) return unsafe;
  const parsed = z.object({ email: z.string().email().max(254) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  await resendVerification(getDb(), getMailer(), parsed.data.email);
  return NextResponse.json({ ok: true });
}
