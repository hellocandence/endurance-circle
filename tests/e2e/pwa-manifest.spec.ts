import sharp from "sharp";
import { expect, test } from "@playwright/test";

// Lighthouse no longer has a PWA category, so installability is checked against Chrome's own criteria:
// a manifest with a name, start_url, display: standalone, and 192 and 512 px icons that really exist.
type Icon = { src: string; sizes: string; type: string; purpose?: string };

test("the web manifest meets the installability criteria", async ({ request, page }) => {
  await page.goto("/login");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");

  const res = await request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
  const m = await res.json();

  expect(m).toMatchObject({ name: "Cadence", short_name: "Cadence", start_url: "/dashboard", scope: "/", display: "standalone", theme_color: "#4f46e5" });
  expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(m.short_name.length).toBeLessThanOrEqual(12);

  const icons = m.icons as Icon[];
  const any = icons.filter((i) => (i.purpose ?? "any").includes("any"));
  expect(any.some((i) => i.sizes === "192x192")).toBe(true);
  expect(any.some((i) => i.sizes === "512x512")).toBe(true);
  expect(icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);

  // every icon exists, is a PNG, and is really the size it claims
  for (const icon of icons) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"]).toBe("image/png");
    const [w, h] = icon.sizes.split("x").map(Number);
    expect(await sharp(await r.body()).metadata(), icon.src).toMatchObject({ width: w, height: h, format: "png" });
  }
  for (const s of m.shortcuts ?? []) expect((await request.get(s.url, { maxRedirects: 0 })).status()).toBeLessThan(400);
});

test("pages carry the theme colour, apple touch icon and standalone hints", async ({ page, request }) => {
  await page.goto("/login");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#4f46e5");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
  await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]').first()).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Cadence");
  const apple = await request.get("/icons/apple-touch-icon.png");
  expect(await sharp(await apple.body()).metadata()).toMatchObject({ width: 180, height: 180 });
  const favicon = await page.locator('link[rel="icon"]').first().getAttribute("href");
  expect((await request.get(favicon!)).status()).toBe(200);
});

test("the manifest and icons are public (an installer is not signed in)", async ({ request }) => {
  for (const url of ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"]) {
    expect((await request.get(url, { maxRedirects: 0 })).status(), url).toBe(200);
  }
});
