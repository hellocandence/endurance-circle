import { NextResponse } from "next/server";
import { requestNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";
import { dayPatchSchema } from "@/server/tracker/schema";
import { trackerResponse } from "@/server/tracker/respond";
import { saveDay } from "@/server/tracker/service";

export const dynamic = "force-dynamic";

// Update the caller's own log for a date (YYYY-MM-DD). Own data only: there is no user id in the URL.
export const PUT = withAuth(
  { action: "write", resource: ({ user }) => ({ kind: "tracker", ownerId: user.id }) },
  async (req, { user, params }) => {
    const parsed = dayPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
    }
    return trackerResponse(user, (await saveDay(getDb(), user.id, params.date, parsed.data, await requestNow())));
  },
);
