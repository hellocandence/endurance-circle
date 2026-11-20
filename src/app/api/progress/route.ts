import { NextResponse } from "next/server";
import { requestNow } from "@/server/clock";
import { getProgressList } from "@/server/dashboard/public";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

// Completion percentages per member (public by design; computed on the server, no body metrics).
export const GET = withAuth({ action: "read", resource: () => ({ kind: "circle.public" }) }, async (_req, { user }) => {
  const rows = await getProgressList(getDb(), await requestNow());
  return NextResponse.json({ members: rows.map((r) => ({ ...r, isMe: r.id === user.id })) });
});
