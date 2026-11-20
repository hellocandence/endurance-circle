import { NextResponse } from "next/server";
import { z } from "zod";
import { requestNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";
import { restartProgram } from "@/server/tracker/service";

export const dynamic = "force-dynamic";

const Body = z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

// Begin again, today or on a chosen date. The old progress is retired, not deleted. Always the session user.
export const POST = withAuth(
  { action: "write", resource: ({ user }) => ({ kind: "tracker", ownerId: user.id }) },
  async (req, { user }) => {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    const result = await restartProgram(getDb(), user.id, await requestNow(), parsed.data.startDate);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, startDate: result.startDate }, { status: 201 });
  },
);
