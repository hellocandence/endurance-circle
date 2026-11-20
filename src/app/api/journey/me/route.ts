import { NextResponse } from "next/server";
import { requestNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { privateJourney } from "@/server/privacy";
import { withAuth } from "@/server/rbac/guard";
import { getJourneyRows } from "@/server/tracker/journey";

export const dynamic = "force-dynamic";

// The caller's own private journey (full logs, including private notes). No user id in the URL.
export const GET = withAuth(
  { action: "read", resource: ({ user }) => ({ kind: "journey", ownerId: user.id }) },
  async (_req, { user }) => {
    const data = await getJourneyRows(getDb(), user.id, await requestNow());
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ programme: data.programme, stats: data.stats, ...privateJourney(user, user.id, data.rows) });
  },
);
