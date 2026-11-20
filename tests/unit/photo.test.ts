import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as t from "@/server/db/schema";
import { deletePhoto, loadPhoto, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES, processPhoto, savePhoto, sniffImage } from "@/server/media/photo";
import { makeTestDb } from "./helpers/db";

/** A photo-like image full of noise, so it compresses badly (a worst case for the 300 KB cap). */
const noisy = (w: number, h: number) => sharp(randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } });
const jpeg = (w = 1600, h = 1200) => noisy(w, h).jpeg({ quality: 90 }).toBuffer();

describe("sniffImage (magic bytes, not names)", () => {
  it("recognises JPEG, PNG and WebP", async () => {
    expect(sniffImage(await jpeg(50, 50))).toBe("jpeg");
    expect(sniffImage(await noisy(50, 50).png().toBuffer())).toBe("png");
    expect(sniffImage(await noisy(50, 50).webp().toBuffer())).toBe("webp");
  });
  it("rejects everything else", () => {
    for (const bytes of [
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
      Buffer.from("GIF89a....."),
      Buffer.from("%PDF-1.7"),
      Buffer.from("MZ\x90\x00"),
      Buffer.from("hello world, definitely not an image"),
      Buffer.alloc(0),
      Buffer.from([0xff, 0xd8]), // too short to be a JPEG signature
    ]) {
      expect(sniffImage(bytes)).toBeNull();
    }
  });
});

describe("processPhoto", () => {
  it("AT-12: outputs 512 px WebP at most 300 KB, plus a 128 px avatar", async () => {
    const input = await jpeg();
    expect(input.length).toBeGreaterThan(500_000); // a heavy upload (noise barely compresses)
    expect(input.length).toBeLessThan(MAX_INPUT_BYTES);
    const r = await processPhoto(input);
    if (!r.ok) throw new Error(r.error);
    const full = await sharp(r.photo.full).metadata();
    const avatar = await sharp(r.photo.avatar).metadata();
    expect(full).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(avatar).toMatchObject({ format: "webp", width: 128, height: 128 });
    expect(r.photo.full.length).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    expect(r.photo.avatar.length).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
  });

  it("crops non-square images to a square instead of stretching", async () => {
    const r = await processPhoto(await jpeg(800, 200));
    if (!r.ok) throw new Error(r.error);
    expect(await sharp(r.photo.full).metadata()).toMatchObject({ width: 512, height: 512 });
  });

  it("strips EXIF (including GPS and copyright) from the output", async () => {
    const withExif = await noisy(400, 300).jpeg().withExif({ IFD0: { Copyright: "SECRET-OWNER", Artist: "Home address" } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined(); // the input really has EXIF
    const r = await processPhoto(withExif);
    if (!r.ok) throw new Error(r.error);
    for (const out of [r.photo.full, r.photo.avatar]) {
      expect((await sharp(out).metadata()).exif).toBeUndefined();
      expect(out.includes(Buffer.from("SECRET-OWNER"))).toBe(false);
    }
  });

  it("accepts PNG and WebP input too", async () => {
    for (const buf of [await noisy(300, 300).png().toBuffer(), await noisy(300, 300).webp().toBuffer()]) {
      expect((await processPhoto(buf)).ok).toBe(true);
    }
  });

  it("AT-11: rejects a non-image over 5 MB", async () => {
    expect(await processPhoto(randomBytes(MAX_INPUT_BYTES + 1))).toEqual({ ok: false, error: "too_large" });
  });

  it("rejects a big image over 5 MB too", async () => {
    const big = await noisy(2400, 2400).png().toBuffer();
    expect(big.length).toBeGreaterThan(MAX_INPUT_BYTES);
    expect(await processPhoto(big)).toEqual({ ok: false, error: "too_large" });
  });

  it("rejects non-images regardless of what they claim to be", async () => {
    expect(await processPhoto(Buffer.from("just some text pretending to be photo.jpg"))).toEqual({ ok: false, error: "unsupported_type" });
    expect(await processPhoto(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toEqual({ ok: false, error: "unsupported_type" });
    expect(await processPhoto(randomBytes(200_000))).toEqual({ ok: false, error: "unsupported_type" });
  });

  it("rejects truncated and corrupt images", async () => {
    const good = await jpeg(400, 300);
    expect(await processPhoto(good.subarray(0, 200))).toEqual({ ok: false, error: "invalid_image" });
    const corrupt = Buffer.concat([good.subarray(0, 100), randomBytes(500)]);
    expect((await processPhoto(corrupt)).ok).toBe(false);
  });

  it("rejects decompression bombs (tiny file, enormous pixel count)", async () => {
    const bomb = await sharp({ create: { width: 12_000, height: 12_000, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(MAX_INPUT_BYTES); // small on the wire...
    expect(await processPhoto(bomb)).toEqual({ ok: false, error: "invalid_image" }); // ...refused before decoding
  });
});

describe("storage", () => {
  let ctx: Awaited<ReturnType<typeof makeTestDb>>;
  let userId: string;
  const db = () => ctx.db as never;
  beforeAll(async () => {
    ctx = await makeTestDb();
    [{ id: userId }] = await ctx.db.insert(t.users).values({ email: "p@example.com", name: "P" }).returning({ id: t.users.id });
  });
  afterAll(() => ctx.close());

  it("AT-12: stored in Postgres as WebP, 512 px and at most 300 KB", async () => {
    const r = await processPhoto(await jpeg(2000, 1500));
    if (!r.ok) throw new Error(r.error);
    await savePhoto(db(), userId, r.photo);

    const full = await loadPhoto(db(), userId, 512);
    expect(full!.mime).toBe("image/webp");
    expect(full!.bytes.length).toBeLessThanOrEqual(300 * 1024);
    expect(await sharp(Buffer.from(full!.bytes)).metadata()).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(await sharp(Buffer.from((await loadPhoto(db(), userId, 128))!.bytes)).metadata()).toMatchObject({ width: 128, height: 128 });
    const [profile] = await ctx.db.select().from(t.profiles);
    expect(profile.avatarPhotoId).toBe(full!.id);
  });

  it("the database itself refuses a photo over 300 KB", async () => {
    await expect(
      ctx.db.insert(t.profilePhotos).values({ userId, width: 512, height: 512, bytes: new Uint8Array(300 * 1024 + 1) }),
    ).rejects.toThrow();
  });

  it("uploading again replaces the old photo (two rows only)", async () => {
    const r = await processPhoto(await jpeg(1000, 1000));
    if (!r.ok) throw new Error(r.error);
    await savePhoto(db(), userId, r.photo);
    await savePhoto(db(), userId, r.photo);
    expect(await ctx.db.select().from(t.profilePhotos)).toHaveLength(2);
  });

  it("delete removes the photos and clears the avatar", async () => {
    await deletePhoto(db(), userId);
    expect(await ctx.db.select().from(t.profilePhotos)).toHaveLength(0);
    expect(await loadPhoto(db(), userId, 512)).toBeNull();
    const [profile] = await ctx.db.select().from(t.profiles);
    expect(profile.avatarPhotoId).toBeNull();
  });
});
