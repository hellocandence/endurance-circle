import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { loginAs, MONDAY, hydrated } from "./helpers";

const png = (w: number, h: number) => sharp(randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
const meId = async (page: Page) => (await (await page.request.get("/api/me")).json()).id as string;

async function open(browser: import("@playwright/test").Browser, email: string) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await ctx.newPage();
  await loginAs(page, email, MONDAY);
  return { ctx, page };
}

test("AT-05: photo routes need a session", async ({ request }) => {
  expect((await request.get("/api/photos/00000000-0000-4000-8000-000000000000")).status()).toBe(401);
});

test("public avatar is 128 px for every member; the full 512 px photo only for the member and the owner", async ({ browser }) => {
  const carol = await open(browser, "carol@e2e.test");
  const carolId = await meId(carol.page);
  const up = await carol.page.request.post("/api/photo", { multipart: { file: { name: "c.png", mimeType: "image/png", buffer: await png(700, 500) } } });
  expect(up.status()).toBe(201);

  // another member: avatar yes, full photo no
  const bob = await open(browser, "bob@e2e.test");
  const avatar = await bob.page.request.get(`/api/photos/${carolId}?size=128`);
  expect(avatar.status()).toBe(200);
  expect(avatar.headers()["content-type"]).toBe("image/webp");
  expect(await sharp(await avatar.body()).metadata()).toMatchObject({ format: "webp", width: 128, height: 128 });
  const byDefault = await bob.page.request.get(`/api/photos/${carolId}`); // no size means avatar
  expect(await sharp(await byDefault.body()).metadata()).toMatchObject({ width: 128 });
  expect((await bob.page.request.get(`/api/photos/${carolId}?size=512`)).status()).toBe(403);

  // the member and the owner can open the full photo
  for (const who of [carol, await open(browser, "owner@e2e.test")]) {
    const full = await who.page.request.get(`/api/photos/${carolId}?size=512`);
    expect(full.status()).toBe(200);
    expect(await sharp(await full.body()).metadata()).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(full.headers()["cache-control"]).toContain("no-cache"); // revalidated each time, so permission changes bite
    await who.ctx.close();
  }
  await bob.ctx.close();
  await carol.ctx.close();
});

test("cache headers: private, ETag, nosniff, and 304 on revalidation", async ({ page }) => {
  await loginAs(page, "owner@e2e.test", MONDAY);
  const id = await meId(page);
  await page.request.post("/api/photo", { multipart: { file: { name: "d.png", mimeType: "image/png", buffer: await png(300, 300) } } });
  const res = await page.request.get(`/api/photos/${id}?size=128`);
  const h = res.headers();
  expect(h["cache-control"]).toMatch(/private/);
  expect(h["cache-control"]).not.toMatch(/public/);
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["vary"]).toMatch(/cookie/i);
  expect(h["etag"]).toBeTruthy();
  const again = await page.request.get(`/api/photos/${id}?size=128`, { headers: { "if-none-match": h["etag"] } });
  expect(again.status()).toBe(304);
});

test("missing photo and bad parameters", async ({ page }) => {
  await loginAs(page, "fresh@e2e.test", MONDAY);
  const id = await meId(page);
  expect((await page.request.get(`/api/photos/${id}?size=128`)).status()).toBe(404); // no photo yet
  expect((await page.request.get(`/api/photos/${id}?size=999`)).status()).toBe(404);
  expect((await page.request.get("/api/photos/not-a-uuid")).status()).toBe(404);
});

test("removing a photo makes it disappear", async ({ page }) => {
  await loginAs(page, "dave@e2e.test", MONDAY);
  const id = await meId(page);
  await page.request.post("/api/photo", { multipart: { file: { name: "d.png", mimeType: "image/png", buffer: await png(200, 200) } } });
  expect((await page.request.get(`/api/photos/${id}?size=128`)).status()).toBe(200);
  expect((await page.request.delete("/api/photo")).status()).toBe(200);
  expect((await page.request.get(`/api/photos/${id}?size=128`)).status()).toBe(404);
});

test.describe("settings: crop and upload", () => {
  test("a wide photo is cropped to a square on the device before upload", async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        if (String(input).endsWith("/api/photo") && init?.body instanceof FormData) {
          const file = init.body.get("file") as File;
          const bitmap = await createImageBitmap(file);
          (window as unknown as { __sent: unknown }).__sent = { w: bitmap.width, h: bitmap.height, type: file.type };
        }
        return original(input, init);
      };
    });
    await loginAs(page, "todd@e2e.test", MONDAY);
    await page.goto("/settings");
    await hydrated(page);
    expect(page.viewportSize()!.width).toBe(375);

    await page.getByLabel("Choose a photo").setInputFiles({ name: "wide.png", mimeType: "image/png", buffer: await png(1200, 600) });
    await expect(page.getByRole("group", { name: "Crop your photo" })).toBeVisible();
    await expect(page.getByTestId("crop-view")).toBeVisible();
    const box = (await page.getByTestId("crop-view").boundingBox())!;
    expect(Math.round(box.width)).toBe(Math.round(box.height)); // the crop window is square

    await page.getByLabel("Zoom").fill("2");
    await page.getByLabel("Move left or right").fill("0.2");

    await page.getByRole("button", { name: "Use photo" }).click();
    await expect(page.getByText("Photo updated.")).toBeVisible();
    // the browser itself sent a square 512 px JPEG, not the 1200x600 original
    expect(await page.evaluate(() => (window as unknown as { __sent: unknown }).__sent)).toEqual({ w: 512, h: 512, type: "image/jpeg" });
    await expect(page.getByRole("img", { name: "Todd Today's photo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();
  });

  test("an unsupported file is explained", async ({ page }) => {
    await loginAs(page, "todd@e2e.test", MONDAY);
    await page.goto("/settings");
    await hydrated(page);
    await page.getByLabel("Choose a photo").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
    await expect(page.locator("p[role=alert]")).toContainText("couldn't be read");
  });
});
