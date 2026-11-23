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
  completionPct: number; // overall
  last7Pct: number;
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

/** Small caps section label. Every label on the story uses this one style. */
function label(ctx: Ctx, p: Palette, font: string, s: string, x: number, y: number, align: CanvasTextAlign = "left") {
  text(ctx, s.toUpperCase(), x, y, { size: 22, weight: 700, color: p.muted, font, spacing: 4, align });
}

function gradientFill(ctx: Ctx, p: Palette, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, p.accent);
  g.addColorStop(1, p.accent2);
  return g;
}

/** Wrap text to the width, at most `maxLines` lines (the last one ends with an ellipsis when it was cut). */
function wrap(ctx: Ctx, s: string, maxWidth: number, maxLines: number, font: string, size: number, weight: number): string[] {
  ctx.font = `${weight} ${size}px ${font}`;
  const words = s.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
      continue;
    }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines - 1) {
      line = words.slice(i).join(" ");
      break;
    }
  }
  lines.push(line);
  const last = lines.length - 1;
  while (ctx.measureText(lines[last]).width > maxWidth && lines[last].length > 1) lines[last] = `${lines[last].slice(0, -2)}…`;
  return lines.slice(0, maxLines);
}

/** A rounded progress track with a gradient fill (0 to 1). */
function bar(ctx: Ctx, p: Palette, x: number, y: number, w: number, h: number, ratio: number) {
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = p.track;
  ctx.fill();
  if (ratio > 0) {
    rr(ctx, x, y, Math.max(h, w * Math.min(1, ratio)), h, h / 2);
    ctx.fillStyle = gradientFill(ctx, p, x, 0, x + w, 0);
    ctx.fill();
  }
}

/**
 * Layout (all on one 72 px margin, one 28 px gap between blocks, inside Instagram's safe area):
 *   brand row . hero (name, day, journey bar) . three equal metric tiles . today card (two-column task list) .
 *   journey card (every day) . the member's own line.
 */
export function drawStory(ctx: Ctx, d: StoryData, theme: StoryTheme, font: string, opts: { details: boolean }) {
  const p = PALETTES[theme];
  const W = STORY_W;
  const H = STORY_H;
  const X = 72;
  const CW = W - X * 2;
  const GAP = 28;
  // With a note on the story the blocks are a little tighter so the note gets its own card and nothing overlaps.
  const compact = Boolean(d.update);

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
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.strokeStyle = p.accent;
  ctx.beginPath();
  ctx.arc(X + 24, 276, 22, Math.PI * 0.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();
  text(ctx, "Endurance Circle", X + 64, 290, { size: 40, weight: 700, color: p.ink, font, spacing: -0.5 });
  text(ctx, d.dateLabel, W - X, 288, { size: 32, weight: 500, color: p.muted, font, align: "right" });

  // --- hero: whose day, which day, how far through
  label(ctx, p, font, d.name, X + 2, 352);
  const num = String(d.dayNumber);
  text(ctx, "Day", X, compact ? 482 : 506, { size: 56, weight: 600, color: p.muted, font });
  ctx.font = `600 56px ${font}`;
  const dayW = ctx.measureText("Day").width;
  text(ctx, num, X + dayW + 24, compact ? 486 : 510, { size: compact ? 150 : 176, weight: 800, color: p.ink, font, spacing: -6 });
  ctx.font = `800 ${compact ? 150 : 176}px ${font}`;
  const numW = ctx.measureText(num).width;
  text(ctx, `of ${d.totalDays}`, X + dayW + 24 + numW + 20, compact ? 486 : 510, { size: 56, weight: 600, color: p.muted, font });
  bar(ctx, p, X, compact ? 514 : 540, CW, 16, Math.max(0.02, d.dayNumber / d.totalDays));

  // --- three equal metric tiles
  const tileY = compact ? 562 : 590;
  const tileH = compact ? 132 : 144;
  const tileW = (CW - GAP * 2) / 3;
  const tiles: { label: string; value: string; sub: string }[] = [
    { label: "Last 7 days", value: `${d.last7Pct}%`, sub: "of tasks done" },
    { label: "Overall", value: `${d.completionPct}%`, sub: "since day 1" },
    { label: "Streak", value: `${d.streak}`, sub: d.streak === 1 ? "perfect day" : "perfect days" },
  ];
  tiles.forEach((t, i) => {
    const tx = X + i * (tileW + GAP);
    glassCard(ctx, p, tx, tileY, tileW, tileH, 44);
    label(ctx, p, font, t.label, tx + 30, tileY + 42);
    text(ctx, t.value, tx + 30, tileY + tileH - (compact ? 38 : 40), { size: compact ? 54 : 60, weight: 800, color: p.ink, font, spacing: -2, maxWidth: tileW - 60 });
    text(ctx, t.sub, tx + 30, tileY + tileH - 12, { size: 22, weight: 500, color: p.muted, font, maxWidth: tileW - 60 });
  });

  // --- today card: progress + two-column task list (+ own numbers)
  const showDetails = opts.details && d.details;
  const todayY = tileY + tileH + GAP;
  const rows = Math.ceil(d.tasks.length / 2);
  const rowH = compact ? 50 : 58;
  const gridTop = compact ? 136 : 150;
  const detailsH = showDetails ? (compact ? 92 : 104) : 0;
  const todayH = gridTop + rows * rowH + 18 + detailsH;
  glassCard(ctx, p, X, todayY, CW, todayH, 52);
  label(ctx, p, font, "Today", X + 40, todayY + 58);
  text(ctx, `${d.done} of ${d.required} tasks`, X + CW - 40, todayY + 60, { size: 30, weight: 700, color: p.ink, font, align: "right" });
  bar(ctx, p, X + 40, todayY + 82, CW - 80, 14, d.required ? d.done / d.required : 0);

  const colW = (CW - 80) / 2;
  d.tasks.forEach((t, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const tx = X + 40 + col * colW;
    const ty = todayY + gridTop + row * rowH;
    const cx = tx + 18;
    const cy = ty + 18;
    if (t.done) {
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fillStyle = gradientFill(ctx, p, cx - 18, cy - 18, cx + 18, cy + 18);
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = p.onAccent;
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy + 1);
      ctx.lineTo(cx - 2, cy + 7);
      ctx.lineTo(cx + 9, cy - 6);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = p.track;
      ctx.stroke();
    }
    text(ctx, t.label, tx + 52, ty + 28, { size: 28, weight: t.done ? 700 : 500, color: t.done ? p.ink : p.muted, font, maxWidth: colW - 64 });
  });

  if (showDetails && d.details) {
    const dy = todayY + todayH - detailsH - 6;
    ctx.fillStyle = p.track;
    ctx.fillRect(X + 40, dy, CW - 80, 2);
    const items = [
      { l: "Run", v: d.details.runKm > 0 ? `${Math.round(d.details.runKm * 10) / 10} km` : "rest" },
      { l: "Study", v: d.details.studyMin > 0 ? fmtDuration(d.details.studyMin) : "-" },
      { l: "Water", v: d.details.waterL > 0 ? `${Math.round(d.details.waterL * 10) / 10} L` : "-" },
      { l: "Reading", v: d.details.readingMin > 0 ? `${d.details.readingMin} min` : "-" },
    ];
    const iw = (CW - 80) / items.length;
    items.forEach((it, i) => {
      const ix = X + 40 + i * iw;
      label(ctx, p, font, it.l, ix, dy + (compact ? 36 : 40));
      text(ctx, it.v, ix, dy + (compact ? 76 : 82), { size: compact ? 32 : 34, weight: 800, color: p.ink, font, spacing: -0.5, maxWidth: iw - 12 });
    });
  }

  // --- journey card: every day of the programme
  const hmY = todayY + todayH + GAP;
  // Compact: 25 squares per row (three rows for 75 days) instead of 15 (five rows), which frees room for the note.
  const cols = compact ? 25 : 15;
  const cell = compact ? 28 : 34;
  const gap = compact ? 6 : 8;
  const gridH = Math.ceil(d.cells.length / cols) * cell + (Math.ceil(d.cells.length / cols) - 1) * gap;
  const hmH = 86 + gridH + 28;
  glassCard(ctx, p, X, hmY, CW, hmH, 52);
  label(ctx, p, font, "Every day so far", X + 40, hmY + 58);
  const doneDays = d.cells.filter((c) => c === "done").length;
  text(ctx, `${doneDays} perfect`, X + CW - 40, hmY + 60, { size: 30, weight: 700, color: p.ink, font, align: "right" });
  const gw = cols * cell + (cols - 1) * gap;
  const gx = X + (CW - gw) / 2;
  const gy = hmY + 86;
  d.cells.forEach((c, i) => {
    const x = gx + (i % cols) * (cell + gap);
    const y = gy + Math.floor(i / cols) * (cell + gap);
    rr(ctx, x, y, cell, cell, 11);
    if (c === "done") {
      ctx.fillStyle = gradientFill(ctx, p, x, y, x + cell, y + cell);
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

  // --- the member's own note: its own card below the graph, wrapped (up to 3 lines), never drawn over anything
  if (d.update) {
    const noteY = hmY + hmH + GAP;
    const lines = wrap(ctx, `“${d.update}”`, CW - 80, 3, font, 30, 500);
    const noteH = 56 + lines.length * 42;
    glassCard(ctx, p, X, noteY, CW, noteH, 48);
    lines.forEach((l, i) => text(ctx, l, X + 40, noteY + 28 + 30 + i * 42, { size: 30, weight: 500, color: p.ink, font }));
  }
}
