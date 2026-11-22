import { NextResponse } from "next/server";
import { z } from "zod";
import { requestNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { withAuth } from "@/server/rbac/guard";
import { adminRestart } from "@/server/tracker/service";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("self"), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  z.object({ scope: z.literal("all"), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  z.object({ scope: z.literal("user"), userId: z.string().uuid(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
]);

// Owner only: restart my own, everyone's, or one member's 75 Hard. can() grants "admin challenge" to the owner alone;
// the explicit role check is defence in depth. Old progress is retired, not deleted.
export const POST = withAuth({ action: "admin", resource: () => ({ kind: "challenge" }) }, async (req, { user }) => {
  if (user.role !== "OWNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { startDate, ...target } = parsed.data;
  const result = await adminRestart(getDb(), user.id, target, await requestNow(), startDate);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true, restarted: result.restarted, startDate: result.startDate });
});
