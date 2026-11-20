import { and, desc, eq } from "drizzle-orm";
import sharp from "sharp";
import type { Db } from "@/server/db/client";
import { profilePhotos, profiles } from "@/server/db/schema";

export const MAX_INPUT_BYTES = 5 * 1024 * 1024; // AT-11: reject anything over 5 MB
export const MAX_OUTPUT_BYTES = 300 * 1024; // AT-12: stored photo is at most 300 KB
export const FULL_SIZE = 512;
export const AVATAR_SIZE = 128;

export type PhotoError = "too_large" | "unsupported_type" | "invalid_image" | "too_big_after_processing";

/**
 * Identify the image by its first bytes, never by file name or the client's Content-Type.
 * Only JPEG, PNG and WebP are accepted (so no SVG, which can carry script, and no animated GIF).
 */
export function sniffImage(buf: Uint8Array): "jpeg" | "png" | "webp" | null {
  const b = buf;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

async function render(input: Buffer, size: number): Promise<Buffer | null> {
  // .rotate() applies the EXIF orientation first; sharp then drops all metadata (EXIF, GPS, ICC) on output.
  const base = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" }).rotate().resize(size, size, { fit: "cover", position: "centre" });
  for (const quality of [80, 70, 60, 50, 40]) {
    const out = await base.clone().webp({ quality }).toBuffer();
    if (out.length <= MAX_OUTPUT_BYTES) return out;
  }
  return null;
}

export type ProcessedPhoto = { full: Buffer; avatar: Buffer };

export async function processPhoto(input: Buffer): Promise<{ ok: true; photo: ProcessedPhoto } | { ok: false; error: PhotoError }> {
  if (input.length > MAX_INPUT_BYTES) return { ok: false, error: "too_large" };
  if (!sniffImage(input)) return { ok: false, error: "unsupported_type" };
  try {
    const [full, avatar] = await Promise.all([render(input, FULL_SIZE), render(input, AVATAR_SIZE)]);
    if (!full || !avatar) return { ok: false, error: "too_big_after_processing" };
    return { ok: true, photo: { full, avatar } };
  } catch {
    return { ok: false, error: "invalid_image" }; // truncated, corrupt, or a decompression bomb
  }
}

/** Replace the member's photo (both sizes). Old rows are removed so storage does not grow. */
export async function savePhoto(db: Db, userId: string, photo: ProcessedPhoto) {
  return db.transaction(async (tx) => {
    await tx.delete(profilePhotos).where(eq(profilePhotos.userId, userId));
    const [full] = await tx.insert(profilePhotos).values({ userId, width: FULL_SIZE, height: FULL_SIZE, bytes: photo.full }).returning({ id: profilePhotos.id });
    await tx.insert(profilePhotos).values({ userId, width: AVATAR_SIZE, height: AVATAR_SIZE, bytes: photo.avatar });
    await tx
      .insert(profiles)
      .values({ userId, avatarPhotoId: full.id })
      .onConflictDoUpdate({ target: profiles.userId, set: { avatarPhotoId: full.id } });
    return { photoId: full.id };
  });
}

export async function deletePhoto(db: Db, userId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(profilePhotos).where(eq(profilePhotos.userId, userId));
    await tx.update(profiles).set({ avatarPhotoId: null }).where(eq(profiles.userId, userId));
  });
}

/** Raw stored bytes for one size (permission is checked by the caller: see T063). */
export async function loadPhoto(db: Db, userId: string, size: typeof FULL_SIZE | typeof AVATAR_SIZE) {
  const [row] = await db
    .select({ bytes: profilePhotos.bytes, mime: profilePhotos.mime, id: profilePhotos.id, createdAt: profilePhotos.createdAt })
    .from(profilePhotos)
    .where(and(eq(profilePhotos.userId, userId), eq(profilePhotos.width, size)))
    .orderBy(desc(profilePhotos.createdAt))
    .limit(1);
  return row ?? null;
}
