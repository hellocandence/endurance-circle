import { NextResponse } from "next/server";
import { z } from "zod";
import { PASSWORD_MAX } from "@/server/auth/password";
import { signUpWithInvite } from "@/server/auth/invites";
import { getDb } from "@/server/db";
import { getMailer } from "@/server/email";
import { rejectUnsafeRequest } from "@/server/http/guards";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(1).max(200),
  email: z.string().email().max(254),
  password: z.string().max(PASSWORD_MAX + 1),
  name: z.string().trim().min(1).max(80),
});

// Public by design, but useless without a valid single-use invite token (BR1). Rate limiting: T025.
export async function POST(req: Request) {
  const unsafe = rejectUnsafeRequest(req);
  if (unsafe) return unsafe;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const result = await signUpWithInvite(getDb(), getMailer(), parsed.data);
  if (result.ok) return NextResponse.json({ ok: true }, { status: 201 });
  const status = result.reason === "email_taken" ? 409 : 400;
  return NextResponse.json({ error: result.reason, message: result.message }, { status });
}
