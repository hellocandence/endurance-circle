import { NextResponse } from "next/server";
import { z } from "zod";
import { requestNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";
import { startProgram } from "@/server/tracker/service";

export const dynamic = "force-dynamic";

const Body = z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

// Start the caller's own 75 Hard programme today, or on a chosen date up to 60 days ahead
// (no user id in the URL: always the session user).
export const POST = withAuth(
  { action: "write", resource: ({ user }) => ({ kind: "tracker", ownerId: user.id }) },
  async (req, { user }) => {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    const result = await startProgram(getDb(), user.id, await requestNow(), parsed.data.startDate);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, created: result.created }, { status: result.created ? 201 : 200 });
  },
);
