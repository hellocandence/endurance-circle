import { after, NextResponse } from "next/server";
import { z } from "zod";
import { resendVerification } from "@/server/auth/account";
import { getDb } from "@/server/db";
import { rejectUnsafeRequest } from "@/server/http/guards";
import { getMailer } from "@/server/email";

export const dynamic = "force-dynamic";

// Public by design. Same response, at the same speed, whether or not the email has an account. Rate limiting: T025.
export async function POST(req: Request) {
  const unsafe = rejectUnsafeRequest(req);
  if (unsafe) return unsafe;
  const parsed = z.object({ email: z.string().email().max(254) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  // Respond before doing any account-dependent work, so response time cannot reveal whether the
  // email is registered (and a mail failure cannot either). Failures are logged without the address.
  after(async () => {
    try {
      await resendVerification(getDb(), getMailer(), parsed.data.email);
    } catch (err) {
      console.error("resend-verification failed:", err instanceof Error ? err.message : "unknown error");
    }
  });
  return NextResponse.json({ ok: true });
}
