import { NextResponse } from "next/server";
import { z } from "zod";
import { requestNow } from "@/server/clock";
import type { Db } from "@/server/db/client";
import { bodyMetrics } from "@/server/privacy";
import { canViewMember } from "@/server/privacy/active";
import type { Actor } from "@/server/rbac/can";
import { bodyPatchSchema, getBodyRow, updateBody } from "./service";

const uuid = z.string().uuid();
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

/** Active circle members only (the owner and the member themself can always read). `actor` is re-checked inside the bodyMetrics projection, so even a wrong route config cannot leak. */
export async function readBody(db: Db, actor: Actor, ownerId: string) {
  if (!uuid.safeParse(ownerId).success || !(await canViewMember(db, actor, ownerId))) return notFound();
  const row = await getBodyRow(db, ownerId);
  return row ? NextResponse.json(bodyMetrics(actor, ownerId, row)) : notFound();
}

export async function writeBody(db: Db, actor: Actor, ownerId: string, req: Request) {
  if (!uuid.safeParse(ownerId).success) return notFound();
  const parsed = bodyPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  const row = await updateBody(db, ownerId, parsed.data, await requestNow());
  return row ? NextResponse.json(bodyMetrics(actor, ownerId, row)) : notFound();
}
