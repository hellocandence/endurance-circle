import { after, NextResponse } from "next/server";
import { z } from "zod";
import { PASSWORD_MAX } from "@/server/auth/password";
import { handleSignUp } from "@/server/auth/signup-handler";
import { getDb } from "@/server/db";
import { getMailer, type Mailer } from "@/server/email";
import { rejectUnsafeRequest } from "@/server/http/guards";
import { limits } from "@/server/http/limits";
import { clientIp, enforce } from "@/server/http/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(1).max(200),
  email: z.string().email().max(254),
  password: z.string().max(PASSWORD_MAX + 1),
  name: z.string().trim().min(1).max(80),
});

// Public by design, but useless without a valid single-use invite token (BR1). Rate limited (T025).
// Answers identically whether or not the email is already registered.
export async function POST(req: Request) {
  const unsafe = rejectUnsafeRequest(req);
  if (unsafe) return unsafe;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const limited = enforce([[limits.signupIp, clientIp(req)]]);
  if (limited) return limited;

  // Mail is sent after the response so timing does not depend on the outcome.
  const mailer = getMailer();
  const deferred: Mailer = {
    send: async (m) =>
      after(async () => {
        try {
          await mailer.send(m);
        } catch (err) {
          console.error("signup email failed:", err instanceof Error ? err.message : "unknown error");
        }
      }),
  };
  const { status, body } = await handleSignUp(getDb(), deferred, parsed.data);
  return NextResponse.json(body, { status });
}
