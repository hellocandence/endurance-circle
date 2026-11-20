import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/server/admin/service";
import { revokeInvite } from "@/server/auth/invites";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

export const DELETE = withAuth({ action: "invite", resource: () => ({ kind: "invite" }) }, async (_req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const db = getDb();
  if (!(await revokeInvite(db, params.id))) return NextResponse.json({ error: "not_pending" }, { status: 409 }); // used, revoked or unknown
  await audit(db, user.id, "invite.revoke", params.id);
  return NextResponse.json({ ok: true });
});
