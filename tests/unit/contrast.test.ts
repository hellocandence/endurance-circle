import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// axe cannot resolve text colour over the gradient background (it reports "incomplete"),
// so contrast is checked here against the worst-case (darkest) gradient stop. NFR-05: AA = 4.5.

type RGB = [number, number, number];
const css = readFileSync("src/app/globals.css", "utf8");

const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const token = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --color-${name} not found`);
  return hex(m[1]);
};
const alpha = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*rgb\\(255 255 255 / ([0-9.]+)\\)`));
  if (!m) throw new Error(`glass token --color-${name} not found`);
  return Number(m[1]);
};

const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const overWhite = (a: number, bg: RGB): RGB => bg.map((c) => Math.round(a * 255 + (1 - a) * c)) as RGB;

const bodyBlock = css.match(/body\s*\{[^}]*\}/)![0];
const stops = [...new Set(bodyBlock.match(/#[0-9a-fA-F]{6}/g))].map(hex);

describe("design token contrast (WCAG AA 4.5:1)", () => {
  const ink = token("ink");
  const muted = token("ink-muted");
  const accent = token("accent");
  const accentStrong = token("accent-strong");
  const white: RGB = [255, 255, 255];

  it.each(stops.map((s) => [s.join(",")] as const))("text on bare gradient stop %s", (key) => {
    const bg = key.split(",").map(Number) as RGB;
    expect(ratio(ink, bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(muted, bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(accentStrong, bg)).toBeGreaterThanOrEqual(4.5); // ghost button
  });

  it.each(stops.map((s) => [s.join(",")] as const))("text on glass over gradient stop %s", (key) => {
    const bg = key.split(",").map(Number) as RGB;
    const glass = overWhite(alpha("glass"), bg);
    const strong = overWhite(alpha("glass-strong"), bg);
    expect(ratio(ink, glass)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(muted, glass)).toBeGreaterThanOrEqual(4.5); // inactive tab, secondary text
    expect(ratio(accent, strong)).toBeGreaterThanOrEqual(4.5); // active tab
  });

  it("white text on primary button", () => {
    expect(ratio(white, accent)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(white, accentStrong)).toBeGreaterThanOrEqual(4.5);
  });
});
