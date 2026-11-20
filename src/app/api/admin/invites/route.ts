import { NextResponse } from "next/server";
import { audit, inviteUrl } from "@/server/admin/service";
import { createInvite, listInvites } from "@/server/auth/invites";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

// Owner only (can(user, ..., { kind: "invite" })). Members get 403 (AT-08).
export const GET = withAuth({ action: "read", resource: () => ({ kind: "invite" }) }, async () => {
  return NextResponse.json({ invites: await listInvites(getDb()) }); // statuses only: the raw token is never stored
});

// The raw invite link is returned once, here; only its hash is kept.
export const POST = withAuth({ action: "invite", resource: () => ({ kind: "invite" }) }, async (_req, { user }) => {
  const db = getDb();
  const invite = await createInvite(db, user.id);
  await audit(db, user.id, "invite.create", invite.id);
  return NextResponse.json({ id: invite.id, url: inviteUrl(invite.token), expiresAt: invite.expiresAt }, { status: 201 });
});
