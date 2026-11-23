import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { runTick } from "@/server/ec/service";
import { log } from "@/server/log";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Public by design, but only with the shared secret: an external cron pings this every 5 minutes (like the keep-alive ping).
// It sends whatever reminders are due now. Safe to call as often as you like: a slot is never sent twice.
export async function POST(req: Request) {
  const secret = process.env.EC_CRON_SECRET;
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!secret || secret.length < 16 || !same(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runTick(getDb(), new Date())) });
  } catch (err) {
    log.error("ec tick failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
