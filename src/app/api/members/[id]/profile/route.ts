import { getDb } from "@/server/db";
import { readProfile, writeProfile } from "@/server/profile/handlers";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

const target = { resource: ({ params }: { params: Record<string, string> }) => ({ kind: "profile" as const, ownerId: params.id }) };

// Read: the member or the owner. Write: the member only, nobody edits someone else's profile.
// The check runs on the id in the URL before anything is read or written.
export const GET = withAuth({ action: "read", ...target }, (_req, { params }) => readProfile(getDb(), params.id));
export const PATCH = withAuth({ action: "write", ...target }, (req, { params }) => writeProfile(getDb(), params.id, req));
