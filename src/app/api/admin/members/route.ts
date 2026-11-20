import { NextResponse } from "next/server";
import { listMembers } from "@/server/admin/service";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

// Owner only. (Includes emails, which is why it is not part of the public circle feed.)
// can() already grants "read member" to the owner alone; the explicit role check below is defence in depth so this
// list stays closed even if that rule is ever loosened (the memberId in the resource is not what protects it).
export const GET = withAuth({ action: "read", resource: ({ user }) => ({ kind: "member", memberId: user.id }) }, async (_req, { user }) => {
  if (user.role !== "OWNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ members: await listMembers(getDb()) });
});
