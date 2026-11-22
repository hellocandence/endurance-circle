import { NextResponse } from "next/server";
import { requestNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";
import { joinCohort } from "@/server/tracker/service";

export const dynamic = "force-dynamic";

// Join the circle-wide fresh start (Day 1 is fixed for everyone) while its window is open (409 after). Always the session user.
export const POST = withAuth(
  { action: "write", resource: ({ user }) => ({ kind: "tracker", ownerId: user.id }) },
  async (_req, { user }) => {
    const result = await joinCohort(getDb(), user.id, await requestNow());
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, created: result.created }, { status: result.created ? 201 : 200 });
  },
);
