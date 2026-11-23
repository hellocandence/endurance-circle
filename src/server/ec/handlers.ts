import { NextResponse } from "next/server";
import type { Db } from "@/server/db/client";
import { limits } from "@/server/http/limits";
import { log } from "@/server/log";
import { getGroupSettings, getMySettings, groupSettingsSchema, mySettingsSchema, saveGroupSettings, saveMySettings, sendTest, type Sender } from "./service";

const invalid = (issues: { path: PropertyKey[]; message: string }[]) =>
  NextResponse.json({ error: "invalid_input", issues: issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });

export const readMine = async (db: Db, userId: string) => NextResponse.json(await getMySettings(db, userId));

export async function writeMine(db: Db, userId: string, req: Request) {
  const parsed = mySettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  return NextResponse.json(await saveMySettings(db, userId, parsed.data));
}

export const readGroup = async (db: Db) => NextResponse.json(await getGroupSettings(db));

export async function writeGroup(db: Db, req: Request) {
  const parsed = groupSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues);
  return NextResponse.json(await saveGroupSettings(db, parsed.data));
}

export async function testMine(db: Db, userId: string, send?: Sender) {
  if (!limits.ecTestUser.check(userId).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  try {
    const out = await sendTest(db, userId, send);
    return out === "no_number" ? NextResponse.json({ error: "no_number" }, { status: 400 }) : NextResponse.json({ ok: true });
  } catch (err) {
    log.error("ec test message failed", err);
    return NextResponse.json({ error: "delivery_failed" }, { status: 502 });
  }
}
