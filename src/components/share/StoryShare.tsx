"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GlassButton, GlassCard } from "@/components/ui";
import { drawStory, STORY_H, STORY_W, type StoryData, type StoryTheme } from "@/lib/story/draw";

const THEMES: { id: StoryTheme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/** Preview of the 9:16 story image, with share (phone share sheet) and download (PNG). Drawn on this device. */
export function StoryShare({ data }: { data: StoryData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [theme, setTheme] = useState<StoryTheme>("light");
  const [details, setDetails] = useState(true);
  const [canShare, setCanShare] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const filename = `endurance-circle-day-${data.dayNumber}.png`;

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const family = getComputedStyle(document.body).fontFamily;
    try {
      await Promise.all([document.fonts.load(`800 100px ${family}`), document.fonts.load(`600 30px ${family}`), document.fonts.load(`500 30px ${family}`)]);
    } catch {
      /* fall back to whatever font is available */
    }
    ctx.clearRect(0, 0, STORY_W, STORY_H);
    drawStory(ctx, data, theme, family, { details });
    canvas.dataset.ready = "true";
  }, [data, theme, details]);

  useEffect(() => {
    void render();
  }, [render]);

  useEffect(() => {
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      setCanShare(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShare(false);
    }
  }, []);

  async function makeBlob(): Promise<Blob | null> {
    await render();
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve(null);
      canvas.toBlob(resolve, "image/png");
    });
  }

  async function download() {
    const blob = await makeBlob();
    if (!blob) return setMessage("Couldn't create the image. Please try again.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setMessage("Saved. Add it to your story from your gallery.");
  }

  async function share() {
    const blob = await makeBlob();
    if (!blob) return setMessage("Couldn't create the image. Please try again.");
    try {
      await navigator.share({ files: [new File([blob], filename, { type: "image/png" })], title: `Day ${data.dayNumber} on Endurance Circle` });
      setMessage(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setMessage("Sharing didn't work here. Use Download instead.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Style" className="glass flex rounded-full p-1">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={theme === t.id}
            onClick={() => setTheme(t.id)}
            className="glass-focus min-h-11 flex-1 rounded-full text-sm font-semibold text-ink-muted aria-checked:bg-glass-strong aria-checked:text-accent-strong aria-checked:shadow-glass-press"
          >
            {t.label}
          </button>
        ))}
      </div>

      <GlassCard className="flex items-center justify-between gap-3 p-4">
        <div id="story-details-label" className="text-sm">
          <span className="font-medium">Show my numbers</span>
          <span className="block text-ink-muted">Run, study, water and reading for the day.</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={details}
          aria-labelledby="story-details-label"
          onClick={() => setDetails((v) => !v)}
          className="glass-focus relative h-8 w-14 shrink-0 rounded-full bg-slate-300 transition-colors duration-200 aria-checked:bg-accent"
        >
          <span aria-hidden="true" className={`absolute left-1 top-1 size-6 rounded-full bg-white shadow transition-transform duration-200 ${details ? "translate-x-6" : ""}`} />
        </button>
      </GlassCard>

      <canvas
        ref={canvasRef}
        width={STORY_W}
        height={STORY_H}
        role="img"
        aria-label={`Story image: day ${data.dayNumber} of ${data.totalDays}, ${data.done} of ${data.required} tasks done`}
        data-testid="story-canvas"
        className="mx-auto w-full max-w-[22rem] rounded-3xl shadow-glass"
        style={{ aspectRatio: "9 / 16" }}
      />

      <div className="flex flex-col gap-2">
        {canShare && <GlassButton onClick={share} className="w-full">Share to story</GlassButton>}
        <GlassButton variant={canShare ? "secondary" : "primary"} onClick={download} className="w-full">Download image</GlassButton>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-center text-sm text-ink-muted">{message}</p>
    </div>
  );
}
