import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { AVATAR_SIZE, FULL_SIZE, loadPhoto } from "@/server/media/photo";
import { canViewMember } from "@/server/privacy/active";
import { withAuth } from "@/server/rbac/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sizeSchema = z.enum(["128", "512"]).default("128");

// ?size=128 (default): the public avatar, any signed-in member. ?size=512: the full photo, the member and
// the owner only. The permission check runs on the id in the URL before anything is read.
export const GET = withAuth(
  {
    action: "read",
    resource: ({ params }, req) =>
      new URL(req.url).searchParams.get("size") === "512"
        ? { kind: "photo", ownerId: params.userId }
        : { kind: "avatar", ownerId: params.userId },
  },
  async (req, { user, params }) => {
    const size = sizeSchema.safeParse(new URL(req.url).searchParams.get("size") ?? undefined);
    if (!size.success || !z.string().uuid().safeParse(params.userId).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!(await canViewMember(getDb(), user, params.userId))) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const photo = await loadPhoto(getDb(), params.userId, size.data === "512" ? FULL_SIZE : AVATAR_SIZE);
    if (!photo) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const etag = `"${photo.id}"`;
    const headers = {
      ETag: etag,
      // private: only the member's own browser may keep it. Avatars may be reused for a while; the full photo must
      // be revalidated every time so a permission change takes effect straight away.
      "Cache-Control": size.data === "512" ? "private, no-cache" : "private, max-age=3600, must-revalidate",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    };
    if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
    return new NextResponse(Buffer.from(photo.bytes), { headers: { ...headers, "Content-Type": photo.mime, "Content-Length": String(photo.bytes.length) } });
  },
);
