import { NextResponse } from "next/server";
import { requestNow } from "@/server/clock";
import { getPublicDashboard } from "@/server/dashboard/public";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

// The circle feed: public member cards only (no body metrics, no private notes, no emails).
export const GET = withAuth({ action: "read", resource: () => ({ kind: "circle.public" }) }, async (_req, { user }) => {
  const { members, pulse } = await getPublicDashboard(getDb(), await requestNow());
  return NextResponse.json({ members: members.map((m) => ({ ...m, isMe: m.id === user.id })), pulse });
});
