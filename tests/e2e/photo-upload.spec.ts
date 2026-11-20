import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { loginAs, MONDAY } from "./helpers";

const file = (name: string, mimeType: string, buffer: Buffer) => ({ multipart: { file: { name, mimeType, buffer } } });

test("AT-05: uploading needs a session", async ({ request }) => {
  expect((await request.post("/api/photo", file("a.png", "image/png", Buffer.from("x")))).status()).toBe(401);
  expect((await request.delete("/api/photo")).status()).toBe(401);
});

test("a valid photo is accepted", async ({ page }) => {
  await loginAs(page, "dave@e2e.test", MONDAY);
  const png = await sharp(randomBytes(600 * 400 * 3), { raw: { width: 600, height: 400, channels: 3 } }).png().toBuffer();
  const res = await page.request.post("/api/photo", file("me.png", "image/png", png));
  expect(res.status()).toBe(201);
  expect(await res.json()).toMatchObject({ ok: true });
});

test("AT-11: a 5 MB+ non-image is rejected", async ({ page }) => {
  await loginAs(page, "dave@e2e.test", MONDAY);
  const res = await page.request.post("/api/photo", file("huge.jpg", "image/jpeg", randomBytes(6 * 1024 * 1024)));
  expect(res.status()).toBe(413);
});

test("a small non-image is rejected whatever its name or type claims", async ({ page }) => {
  await loginAs(page, "dave@e2e.test", MONDAY);
  for (const f of [
    file("photo.jpg", "image/jpeg", Buffer.from("not an image at all")),
    file("pic.png", "image/png", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")),
    file("run.exe", "application/octet-stream", Buffer.from("MZ\x90\x00 fake binary")),
  ]) {
    expect((await page.request.post("/api/photo", f)).status()).toBe(415);
  }
});

test("a request without a file is a 400", async ({ page }) => {
  await loginAs(page, "dave@e2e.test", MONDAY);
  const res = await page.request.post("/api/photo", { multipart: { note: "no file here" } });
  expect(res.status()).toBe(400);
});

test("a cross-origin upload is refused (the session cookie alone is not enough)", async ({ page }) => {
  await loginAs(page, "dave@e2e.test", MONDAY);
  const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#123" } }).png().toBuffer();
  const res = await page.request.post("/api/photo", { ...file("x.png", "image/png", png), headers: { origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
});
