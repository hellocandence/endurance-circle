import { NextResponse } from "next/server";
import { z } from "zod";
import { requestNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { privateJourney } from "@/server/privacy";
import { withAuth } from "@/server/rbac/guard";
import { getJourneyRows } from "@/server/tracker/journey";

export const dynamic = "force-dynamic";

// A member's private journey: the member themself or the owner (AT-02, AT-04). The permission check
// runs on the id in the URL before anything is read, so other members get 403 whether or not it exists.
export const GET = withAuth(
  { action: "read", resource: ({ params }) => ({ kind: "journey", ownerId: params.id }) },
  async (_req, { user, params }) => {
    if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const data = await getJourneyRows(getDb(), params.id, await requestNow());
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ programme: data.programme, stats: data.stats, ...privateJourney(user, params.id, data.rows) });
  },
);
