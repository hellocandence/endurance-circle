import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "@/server/auth/account";
import { PASSWORD_MAX } from "@/server/auth/password";
import { getDb } from "@/server/db";
import { rejectUnsafeRequest } from "@/server/http/guards";

export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().min(1).max(200), password: z.string().max(PASSWORD_MAX + 1) });

// Public by design (the emailed token is the credential).
export async function POST(req: Request) {
  const unsafe = rejectUnsafeRequest(req);
  if (unsafe) return unsafe;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const result = await resetPassword(getDb(), parsed.data);
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.reason, message: result.message }, { status: 400 });
}
