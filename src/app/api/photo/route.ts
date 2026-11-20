import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { limits } from "@/server/http/limits";
import { tooManyRequests } from "@/server/http/rate-limit";
import { deletePhoto, MAX_INPUT_BYTES, processPhoto, savePhoto, type PhotoError } from "@/server/media/photo";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // sharp is a native module

const own = { resource: ({ user }: { user: { id: string } }) => ({ kind: "photo" as const, ownerId: user.id }) };
const STATUS: Record<PhotoError, number> = { too_large: 413, unsupported_type: 415, invalid_image: 422, too_big_after_processing: 422 };
const MULTIPART_OVERHEAD = 64 * 1024;

// Replace the caller's own profile photo. The owner is always the session user (no id in the URL).
export const POST = withAuth({ action: "write", ...own }, async (req, { user }) => {
  const limited = limits.photoUser.check(user.id);
  if (!limited.allowed) return tooManyRequests(limited.retryAfterSec);

  // Refuse oversized bodies before buffering them (a missing length cannot be trusted either).
  const length = Number(req.headers.get("content-length"));
  if (!req.headers.get("content-length") || !Number.isFinite(length)) return NextResponse.json({ error: "length_required" }, { status: 411 });
  if (length > MAX_INPUT_BYTES + MULTIPART_OVERHEAD) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });
  if (file.size > MAX_INPUT_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const result = await processPhoto(Buffer.from(await file.arrayBuffer()));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] });

  const { photoId } = await savePhoto(getDb(), user.id, result.photo);
  return NextResponse.json({ ok: true, photoId }, { status: 201 });
});

export const DELETE = withAuth({ action: "write", ...own }, async (_req, { user }) => {
  await deletePhoto(getDb(), user.id);
  return NextResponse.json({ ok: true });
});
