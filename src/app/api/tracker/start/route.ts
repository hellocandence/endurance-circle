import { NextResponse } from "next/server";
import { requestNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";
import { startProgram } from "@/server/tracker/service";

export const dynamic = "force-dynamic";

// Start the caller's own 75 Hard programme (no user id in the URL: always the session user).
export const POST = withAuth(
  { action: "write", resource: ({ user }) => ({ kind: "tracker", ownerId: user.id }) },
  async (_req, { user }) => {
    const { created } = await startProgram(getDb(), user.id, await requestNow());
    return NextResponse.json({ ok: true, created }, { status: created ? 201 : 200 });
  },
);
