import { getDb } from "@/server/db";
import { readGroup, writeGroup } from "@/server/ec/handlers";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";

const group = { resource: () => ({ kind: "ec_group" as const }) };

export const GET = withAuth({ action: "read", ...group }, () => readGroup(getDb()));
export const PUT = withAuth({ action: "admin", ...group }, (req) => writeGroup(getDb(), req)); // owner only
