import { readBody, writeBody } from "@/server/body/handlers";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

const target = { resource: ({ params }: { params: Record<string, string> }) => ({ kind: "body" as const, ownerId: params.id }) };

// BR3: body metrics are readable by the member and the owner only (AT-01, AT-04), and writable by the
// member only. The check runs on the id in the URL before anything is read, so other members get 403.
export const GET = withAuth({ action: "read", ...target }, (_req, { user, params }) => readBody(getDb(), user, params.id));
export const PATCH = withAuth({ action: "write", ...target }, (req, { user, params }) => writeBody(getDb(), user, params.id, req));
