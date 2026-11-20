import { requestNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";
import { trackerResponse } from "@/server/tracker/respond";
import { getToday } from "@/server/tracker/service";

export const dynamic = "force-dynamic";

// The caller's own tracker for today. The user comes from the session, never from the URL.
export const GET = withAuth(
  { action: "read", resource: ({ user }) => ({ kind: "tracker", ownerId: user.id }) },
  async (_req, { user }) => trackerResponse(user, (await getToday(getDb(), user.id, await requestNow()))),
);
