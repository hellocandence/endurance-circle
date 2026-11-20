/*
 * Draws the shareable "story" image: 1080 x 1920 (9:16, Instagram / WhatsApp status), on a canvas, on the
 * device. Nothing is sent to a server. Key content stays inside the area Instagram leaves free
 * (about 250 px from the top and bottom).
 */

export const STORY_W = 1080;
export const STORY_H = 1920;

export type CellState = "done" | "missed" | "today" | "future";

export type StoryData = {
  name: string;
  dateLabel: string; // e.g. "Mon, 23 Nov"
  dayNumber: number;
  totalDays: number;
  done: number;
  required: number;
  tasks: { label: string; done: boolean }[];
  streak: number;
  completionPct: number;
  cells: CellState[];
  /** The member's own amounts for the day. Shown only when they choose to include them. */
  details: { runKm: number; waterL: number; studyMin: number; readingMin: number } | null;
  update: string | null;
};

export type StoryTheme = "light" | "dark";

type Palette = {
  bg: [string, string, string];
  blobs: [string, string][]; // [color, position key]
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  card: string;
  cardBorder: string;
  shadow: string;
  track: string;
  chipIdle: string;
  missed: string;
  future: string;
  onAccent: string;
};

const PALETTES: Record<StoryTheme, Palette> = {
  light: {
    bg: ["#f5f3ff", "#e0e7ff", "#fce7f3"],
    blobs: [["rgba(99,102,241,0.38)", "a"], ["rgba(244,114,182,0.30)", "b"], ["rgba(34,211,238,0.26)", "c"]],
    ink: "#0f172a",
    muted: "#475569",
    accent: "#4f46e5",
    accent2: "#8b5cf6",
    card: "rgba(255,255,255,0.66)",
    cardBorder: "rgba(255,255,255,0.95)",
    shadow: "rgba(49,46,129,0.16)",
    track: "rgba(79,70,229,0.14)",
    chipIdle: "rgba(15,23,42,0.07)",
    missed: "rgba(251,113,133,0.55)",
    future: "rgba(71,85,105,0.16)",
    onAccent: "#ffffff",
  },
  dark: {
    bg: ["#0b1020", "#1e1b4b", "#3b0764"],
    blobs: [["rgba(99,102,241,0.50)", "a"], ["rgba(236,72,153,0.34)", "b"], ["rgba(34,211,238,0.22)", "c"]],
    ink: "#f8fafc",
    muted: "#a5b4cf",
    accent: "#818cf8",
    accent2: "#c4b5fd",
    card: "rgba(255,255,255,0.09)",
    cardBorder: "rgba(255,255,255,0.20)",
    shadow: "rgba(0,0,0,0.35)",
    track: "rgba(255,255,255,0.14)",
    chipIdle: "rgba(255,255,255,0.10)",
    missed: "rgba(251,113,133,0.60)",
    future: "rgba(255,255,255,0.12)",
    onAccent: "#0b1020",
  },
};

type Ctx = CanvasRenderingContext2D;

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function glassCard(ctx: Ctx, p: Palette, x: number, y: number, w: number, h: number, r = 56) {
  ctx.save();
  ctx.shadowColor = p.shadow;
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = p.card;
  ctx.fill();
  ctx.restore();
  rr(ctx, x, y, w, h, r);
  ctx.lineWidth = 2;
  ctx.strokeStyle = p.cardBorder;
  ctx.stroke();
}

function text(ctx: Ctx, s: string, x: number, y: number, o: { size: number; weight?: number; color: string; font: string; align?: CanvasTextAlign; spacing?: number; maxWidth?: number }) {
  ctx.font = `${o.weight ?? 600} ${o.size}px ${o.font}`;
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${o.spacing ?? 0}px`;
  let out = s;
  if (o.maxWidth) while (out.length > 1 && ctx.measureText(out).width > o.maxWidth) out = `${out.slice(0, -2)}…`;
  ctx.fillText(out, x, y);
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = "0px";
}

const fmtDuration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m` : `${min} min`);

export function drawStory(ctx: Ctx, d: StoryData, theme: StoryTheme, font: string, opts: { details: boolean }) {
  const p = PALETTES[theme];
  const W = STORY_W;
  const H = STORY_H;
  const X = 72;
  const CW = W - X * 2;

  // --- background: soft gradient with colour glows (the app's glass look)
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, p.bg[0]);
  bg.addColorStop(0.5, p.bg[1]);
  bg.addColorStop(1, p.bg[2]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const spots: Record<string, [number, number, number]> = { a: [160, 340, 560], b: [960, 1100, 620], c: [260, 1720, 520] };
  for (const [color, key] of p.blobs) {
    const [cx, cy, r] = spots[key];
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // --- brand row
  ctx.save();
  ctx.lineWidth = 9;
  ctx.strokeStyle = p.accent;
  ctx.beginPath();
  ctx.arc(X + 30, 268, 26, Math.PI * 0.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();
  text(ctx, "cadence", X + 78, 284, { size: 50, weight: 700, color: p.ink, font, spacing: -1 });
  text(ctx, d.dateLabel, W - X, 282, { size: 34, weight: 500, color: p.muted, font, align: "right" });

  // --- hero: whose day, and which day
  text(ctx, d.name, X, 376, { size: 54, weight: 700, color: p.ink, font, maxWidth: CW });
  text(ctx, "DAY", X + 4, 438, { size: 32, weight: 600, color: p.muted, font, spacing: 8 });
  const num = String(d.dayNumber);
  text(ctx, num, X - 6, 650, { size: 236, weight: 800, color: p.ink, font, spacing: -7 });
  ctx.font = `800 236px ${font}`;
  const numW = ctx.measureText(num).width;
  text(ctx, `/ ${d.totalDays}`, X + numW + 16, 650, { size: 84, weight: 600, color: p.muted, font });
  // journey bar
  rr(ctx, X, 686, CW, 18, 9);
  ctx.fillStyle = p.track;
  ctx.fill();
  const frac = Math.max(0.02, Math.min(1, d.dayNumber / d.totalDays));
  const barGrad = ctx.createLinearGradient(X, 0, X + CW, 0);
  barGrad.addColorStop(0, p.accent);
  barGrad.addColorStop(1, p.accent2);
  rr(ctx, X, 686, CW * frac, 18, 9);
  ctx.fillStyle = barGrad;
  ctx.fill();

  // --- today card: ring + three stats
  const cardY = 736;
  const cardH = 300;
  glassCard(ctx, p, X, cardY, CW, cardH);
  const rcx = X + 196;
  const rcy = cardY + cardH / 2;
  const rad = 98;
  ctx.lineWidth = 30;
  ctx.lineCap = "round";
  ctx.strokeStyle = p.track;
  ctx.beginPath();
  ctx.arc(rcx, rcy, rad, 0, Math.PI * 2);
  ctx.stroke();
  const ratio = d.required ? Math.min(1, d.done / d.required) : 0;
  if (ratio > 0) {
    const g = ctx.createLinearGradient(rcx - rad, rcy - rad, rcx + rad, rcy + rad);
    g.addColorStop(0, p.accent);
    g.addColorStop(1, p.accent2);
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.arc(rcx, rcy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
  }
  text(ctx, `${d.done}/${d.required}`, rcx, rcy + 14, { size: 60, weight: 800, color: p.ink, font, align: "center", spacing: -2 });
  text(ctx, "tasks", rcx, rcy + 52, { size: 26, weight: 500, color: p.muted, font, align: "center" });

  const stats: { label: string; value: string }[] = [
    { label: "STREAK", value: `${d.streak} ${d.streak === 1 ? "day" : "days"}` },
    { label: "COMPLETION", value: `${d.completionPct}%` },
  ];
  if (opts.details && d.details) stats.push({ label: "RUN", value: d.details.runKm > 0 ? `${Math.round(d.details.runKm * 10) / 10} km` : "rest" });
  else stats.push({ label: "DAY", value: `${d.dayNumber} of ${d.totalDays}` });
  const sx = X + 420;
  const rowH = 86;
  stats.forEach((s, i) => {
    const y = cardY + 40 + i * rowH;
    text(ctx, s.label, sx, y + 22, { size: 22, weight: 600, color: p.muted, font, spacing: 4 });
    text(ctx, s.value, sx, y + 64, { size: 46, weight: 800, color: p.ink, font, spacing: -1, maxWidth: CW - 420 - 36 });
  });

  // --- task chips
  let cy = cardY + cardH + 32;
  let cx = X;
  const chipH = 54;
  for (const t of d.tasks) {
    ctx.font = `600 26px ${font}`;
    const w = ctx.measureText(t.label).width + (t.done ? 72 : 48);
    if (cx + w > X + CW) {
      cx = X;
      cy += chipH + 14;
    }
    rr(ctx, cx, cy, w, chipH, chipH / 2);
    ctx.fillStyle = t.done ? p.accent : p.chipIdle;
    ctx.fill();
    let tx = cx + 24;
    if (t.done) {
      ctx.save();
      ctx.strokeStyle = p.onAccent;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cx + 22, cy + chipH / 2 + 1);
      ctx.lineTo(cx + 30, cy + chipH / 2 + 9);
      ctx.lineTo(cx + 46, cy + chipH / 2 - 8);
      ctx.stroke();
      ctx.restore();
      tx = cx + 56;
    }
    text(ctx, t.label, tx, cy + 37, { size: 26, weight: 600, color: t.done ? p.onAccent : p.muted, font });
    cx += w + 12;
  }
  let nextY = cy + chipH + 34;

  // --- optional numbers line (own amounts, only when included)
  if (opts.details && d.details) {
    const bits = [
      d.details.studyMin > 0 ? `Study ${fmtDuration(d.details.studyMin)}` : null,
      d.details.waterL > 0 ? `Water ${Math.round(d.details.waterL * 10) / 10} L` : null,
      d.details.readingMin > 0 ? `Reading ${d.details.readingMin} min` : null,
    ].filter(Boolean) as string[];
    if (bits.length) {
      text(ctx, bits.join("   ·   "), W / 2, nextY + 10, { size: 28, weight: 600, color: p.muted, font, align: "center", maxWidth: CW });
      nextY += 56;
    }
  }

  // --- the 75 days
  const hmH = 292;
  const hmY = nextY;
  glassCard(ctx, p, X, hmY, CW, hmH, 48);
  text(ctx, `Every day so far`, X + 40, hmY + 58, { size: 28, weight: 700, color: p.ink, font });
  const done = d.cells.filter((c) => c === "done").length;
  text(ctx, `${done} done`, X + CW - 40, hmY + 58, { size: 26, weight: 600, color: p.muted, font, align: "right" });
  const cols = 15;
  const cell = 34;
  const gap = 8;
  const gw = cols * cell + (cols - 1) * gap;
  const gx = X + (CW - gw) / 2;
  const gy = hmY + 86;
  d.cells.forEach((c, i) => {
    const x = gx + (i % cols) * (cell + gap);
    const y = gy + Math.floor(i / cols) * (cell + gap);
    rr(ctx, x, y, cell, cell, 11);
    if (c === "done") {
      const g = ctx.createLinearGradient(x, y, x + cell, y + cell);
      g.addColorStop(0, p.accent);
      g.addColorStop(1, p.accent2);
      ctx.fillStyle = g;
      ctx.fill();
    } else if (c === "missed") {
      ctx.fillStyle = p.missed;
      ctx.fill();
    } else if (c === "today") {
      ctx.fillStyle = p.chipIdle;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = p.accent;
      ctx.stroke();
    } else {
      ctx.fillStyle = p.future;
      ctx.fill();
    }
  });

  // --- footer
  const fy = hmY + hmH + 58;
  if (d.update) text(ctx, `“${d.update}”`, W / 2, fy, { size: 30, weight: 500, color: p.muted, font, align: "center", maxWidth: CW - 40 });
  text(ctx, "cadence", W / 2, fy + (d.update ? 56 : 0), { size: 32, weight: 700, color: p.ink, font, align: "center", spacing: 1 });
}
