import { NextResponse } from "next/server";
import { z } from "zod";
import { requestNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { privateJourney } from "@/server/privacy";
import { withAuth } from "@/server/rbac/guard";
import { canViewMember } from "@/server/privacy/active";
import { getJourneyRows } from "@/server/tracker/journey";

export const dynamic = "force-dynamic";

// A member's journey, readable by the whole circle (T104, AT-02) but only for active members: a removed or
// unconfirmed member is 404 for everyone except themself and the owner.
export const GET = withAuth(
  { action: "read", resource: ({ params }) => ({ kind: "journey", ownerId: params.id }) },
  async (_req, { user, params }) => {
    if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!(await canViewMember(getDb(), user, params.id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const data = await getJourneyRows(getDb(), params.id, await requestNow());
    if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ programme: data.programme, stats: data.stats, ...privateJourney(user, params.id, data.rows) });
  },
);
