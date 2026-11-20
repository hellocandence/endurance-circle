import { NextResponse } from "next/server";
import { z } from "zod";
import { removeMember } from "@/server/admin/service";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

// Remove a member: owner only, and never the owner themself (can() denies both). The permission check
// runs on the id in the URL first, so members get 403 whether or not the id exists (AT-08).
export const DELETE = withAuth(
  { action: "remove", resource: ({ params }) => ({ kind: "member", memberId: params.id }) },
  async (req, { user, params }) => {
    if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const permanent = new URL(req.url).searchParams.get("permanent") === "true";
    const result = await removeMember(getDb(), user.id, params.id, { permanent });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 403 });
    return NextResponse.json({ ok: true, mode: result.mode });
  },
);
