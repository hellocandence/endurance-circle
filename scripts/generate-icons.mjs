// Regenerates the app icons from one SVG: `node scripts/generate-icons.mjs`
import sharp from "sharp";

// A progress ring closing on a dot: the circle closing on a dot, endurance that completes. `inset` shrinks the mark so the
// maskable icon keeps it inside the 80% safe zone (platforms crop that icon to circles, squircles, ...).
const svg = (inset = 0, rounded = true) => {
  const s = 512;
  const r = rounded ? 112 : 0;
  const scale = 1 - inset * 2;
  const t = (s - s * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>
  </defs>
  <rect width="${s}" height="${s}" rx="${r}" fill="url(#bg)"/>
  <g transform="translate(${t} ${t}) scale(${scale})">
    <circle cx="256" cy="256" r="132" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="40"/>
    <path d="M256 124 A132 132 0 1 1 124.6 270" fill="none" stroke="#ffffff" stroke-width="40" stroke-linecap="round"/>
    <circle cx="256" cy="256" r="30" fill="#ffffff"/>
  </g>
</svg>`;
};

const out = [
  ["public/icons/icon-192.png", svg(0, true), 192],
  ["public/icons/icon-512.png", svg(0, true), 512],
  ["public/icons/maskable-512.png", svg(0.1, false), 512], // full-bleed square, mark inside the safe zone
  ["public/icons/apple-touch-icon.png", svg(0, false), 180], // iOS rounds the corners itself
  ["src/app/icon.png", svg(0, true), 64], // browser tab favicon
];
for (const [file, markup, size] of out) {
  await sharp(Buffer.from(markup)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  console.log("wrote", file);
}
