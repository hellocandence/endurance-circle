import { NextResponse } from "next/server";
import { listMembers } from "@/server/admin/service";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

// Owner only. (Includes emails, which is why it is not part of the public circle feed.)
export const GET = withAuth({ action: "read", resource: ({ user }) => ({ kind: "member", memberId: user.id }) }, async () => {
  return NextResponse.json({ members: await listMembers(getDb()) });
});
