import { NextResponse } from "next/server";
import { z } from "zod";
import { audit, inviteUrl } from "@/server/admin/service";
import { createInvite, listInvites, revokeInvite } from "@/server/auth/invites";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";
import { getMailer } from "@/server/email";
import { inviteEmail } from "@/server/email/templates";
import { withAuth } from "@/server/rbac/guard";
import { log } from "@/server/log";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Owner only (can(user, ..., { kind: "invite" })). Members get 403 (AT-08).
export const GET = withAuth({ action: "read", resource: () => ({ kind: "invite" }) }, async () => {
  return NextResponse.json({ invites: await listInvites(getDb()) }); // statuses only: the raw token is never stored
});

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254).optional() });

// With `email`: the invite is bound to that address and emailed to it; the link is NOT returned, because
// receiving the email is what proves the inbox. Without `email`: an open link, returned once, only its hash is kept.
export const POST = withAuth({ action: "invite", resource: () => ({ kind: "invite" }) }, async (req, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  const { email } = parsed.data;
  const db = getDb();

  if (email) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return NextResponse.json({ error: "already_member" }, { status: 409 });
  }

  const invite = await createInvite(db, user.id, new Date(), email);
  await audit(db, user.id, "invite.create", invite.id);
  if (!email) return NextResponse.json({ id: invite.id, url: inviteUrl(invite.token), expiresAt: invite.expiresAt }, { status: 201 });

  try {
    await getMailer().send({ to: email, ...inviteEmail({ inviterName: user.name, email, url: inviteUrl(invite.token) }) });
  } catch (err) {
    log.error("invite email failed", err);
    await revokeInvite(db, invite.id); // nobody has the link, so do not leave a live invite behind
    return NextResponse.json({ error: "email_failed" }, { status: 502 });
  }
  return NextResponse.json({ id: invite.id, emailed: true, expiresAt: invite.expiresAt }, { status: 201 });
});
