import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { PASSWORD_MAX } from "@/server/auth/password";
import { changePassword } from "@/server/auth/security";
import { sessionCookie } from "@/server/auth/session-config";
import { getDb } from "@/server/db";
import { getMailer } from "@/server/email";
import { limits } from "@/server/http/limits";
import { tooManyRequests } from "@/server/http/rate-limit";
import { withAuth } from "@/server/rbac/guard";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";

const Body = z.object({ currentPassword: z.string().min(1).max(PASSWORD_MAX), newPassword: z.string().max(PASSWORD_MAX + 1) });

export const POST = withAuth(
  { action: "write", resource: ({ user }) => ({ kind: "profile", ownerId: user.id }) },
  async (req, { user }) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

    // Reserve a slot before the (slow) password check and give it back unless the guess was wrong.
    const slot = limits.passwordUser.check(user.id);
    if (!slot.allowed) return tooManyRequests(slot.retryAfterSec);

    const keep = (await cookies()).get(sessionCookie().name)?.value ?? null;
    const result = await changePassword(getDb(), user.id, { ...parsed.data, keepSessionToken: keep });
    if (result.ok || result.reason !== "wrong_password") limits.passwordUser.release(user.id);

    if (!result.ok) {
      const status = result.reason === "wrong_password" ? 403 : 400;
      return NextResponse.json({ error: result.reason, message: result.message }, { status });
    }

    after(async () => {
      try {
        await getMailer().send({
          to: user.email,
          subject: "Your Cadence password was changed",
          text: "Your Cadence password was just changed and your other devices were signed out.\n\nIf this was not you, reset your password right away from the sign-in page.",
        });
      } catch (err) {
        log.error("password-change notice failed", err);
      }
    });
    return NextResponse.json({ ok: true, signedOutOthers: result.signedOutOthers });
  },
);
