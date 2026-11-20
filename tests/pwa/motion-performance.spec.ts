import { expect, test, type Page } from "@playwright/test";

// Measured on the PRODUCTION build (dev mode is unoptimised and would say nothing about real phones),
// with Chrome DevTools' 4x CPU slowdown, which is the usual stand-in for a mid-range Android phone.
type W = { __frames: number[]; __long: number[] };

/** Installed on every page load, so it survives full navigations (page.goto). */
const installSampler = () => {
  const w = window as unknown as W;
  w.__frames = [];
  w.__long = [];
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ type: "longtask" });
  } catch { /* longtask unsupported */ }
  let last = performance.now();
  const tick = (t: number) => { w.__frames.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};

async function frameStats(page: Page, run: () => Promise<void>, ms = 1800) {
  await page.evaluate(() => { const w = window as unknown as W; w.__frames.length = 0; w.__long.length = 0; });
  await run();
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const w = window as unknown as W;
    const f = [...w.__frames].slice(1).sort((a, b) => a - b);
    return { frames: f.length, p50: f[Math.floor(f.length * 0.5)], p95: f[Math.floor(f.length * 0.95)], worst: f.at(-1)!, longTasks: w.__long.length, longest: Math.max(0, ...w.__long) };
  });
}

test("transitions and the progress ring stay smooth with the CPU slowed 4x", async ({ page }) => {
  await page.addInitScript(installSampler);
  const cdp = await page.context().newCDPSession(page);
  await page.goto("/login");
  await page.waitForTimeout(500);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  // 1. a page transition, then 2. the ui-preview page where three rings animate and cards slide in
  const transition = await frameStats(page, () => page.getByRole("link", { name: "Forgot your password?" }).click());
  const rings = await frameStats(page, () => page.goto("/ui-preview").then(() => undefined));
  console.log("4x CPU, page transition:", JSON.stringify(transition));
  console.log("4x CPU, rings + cards   :", JSON.stringify(rings));

  for (const s of [transition, rings]) {
    expect(s.frames).toBeGreaterThan(20);
    expect(s.p50).toBeLessThan(25); // typical frame within ~1.5 refresh intervals
    expect(s.p95).toBeLessThan(50); // 95% of frames faster than 20 fps
    expect(s.longest).toBeLessThan(250); // no single task freezes the UI for a quarter of a second
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});
