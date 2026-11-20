import { readBody, writeBody } from "@/server/body/handlers";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

const own = { resource: ({ user }: { user: { id: string } }) => ({ kind: "body" as const, ownerId: user.id }) };

// The caller's own body limits (PRIVATE). No user id in the URL.
export const GET = withAuth({ action: "read", ...own }, (_req, { user }) => readBody(getDb(), user, user.id));
export const PATCH = withAuth({ action: "write", ...own }, (req, { user }) => writeBody(getDb(), user, user.id, req));
