import { NextResponse } from "next/server";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { getProfile, profilePatchSchema, updateProfile } from "./service";

const uuid = z.string().uuid();

export async function readProfile(db: Db, id: string) {
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const profile = await getProfile(db, id);
  return profile ? NextResponse.json(profile) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function writeProfile(db: Db, id: string, req: Request) {
  const parsed = profilePatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  const updated = await updateProfile(db, id, parsed.data);
  return updated ? NextResponse.json(updated) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
