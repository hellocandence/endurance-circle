"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { FormMessage } from "@/components/auth/fields";
import { GlassButton } from "@/components/ui";
import { Section, type Status } from "./Section";

const VIEW = 280; // px, the on-screen crop square
const OUT = 512; // px, what we upload
const ERRORS: Record<string, string> = {
  too_large: "That file is too large. Choose one under 5 MB.",
  unsupported_type: "Use a JPEG, PNG or WebP photo.",
  invalid_image: "That image couldn't be read. Try another one.",
  too_big_after_processing: "That image couldn't be shrunk enough. Try another one.",
};

export function PhotoUploader({ userId, avatarPhotoId, name }: { userId: string; avatarPhotoId: string | null; name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [px, setPx] = useState(0.5); // 0..1: which part of the overflow is visible
  const [py, setPy] = useState(0.5);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  function choose(file: File | undefined) {
    if (!file) return;
    setStatus({ kind: "idle" });
    if (src) URL.revokeObjectURL(src);
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { setImg(el); setSrc(url); setZoom(1); setPx(0.5); setPy(0.5); };
    el.onerror = () => { URL.revokeObjectURL(url); setStatus({ kind: "error", text: ERRORS.invalid_image }); };
    el.src = url;
  }

  // The square of the source image that is currently visible (the browser has already applied EXIF rotation).
  function sourceRect(el: HTMLImageElement) {
    const side = Math.min(el.naturalWidth, el.naturalHeight) / zoom;
    return { side, x: (el.naturalWidth - side) * px, y: (el.naturalHeight - side) * py };
  }

  async function upload() {
    if (!img) return;
    setStatus({ kind: "saving" });
    const { side, x, y } = sourceRect(img);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = OUT;
    canvas.getContext("2d")!.drawImage(img, x, y, side, side, 0, 0, OUT, OUT);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return setStatus({ kind: "error", text: ERRORS.invalid_image });

    const body = new FormData();
    body.append("file", blob, "photo.jpg");
    const res = await fetch("/api/photo", { method: "POST", body }).catch(() => null);
    if (res?.ok) {
      setSrc(null); setImg(null);
      setStatus({ kind: "ok", text: "Photo updated." });
      router.refresh();
    } else {
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      setStatus({ kind: "error", text: res?.status === 429 ? "Too many uploads. Try again later." : (ERRORS[data?.error ?? ""] ?? "Couldn't upload. Please try again.") });
    }
  }

  async function remove() {
    setStatus({ kind: "saving" });
    const res = await fetch("/api/photo", { method: "DELETE" }).catch(() => null);
    if (res?.ok) { setStatus({ kind: "ok", text: "Photo removed." }); router.refresh(); }
    else setStatus({ kind: "error", text: "Couldn't remove the photo." });
  }

  // Dragging the picture moves the crop window (the sliders do the same for keyboard users).
  const onDown = (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px, py }; };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !img) return;
    const scale = (Math.min(img.naturalWidth, img.naturalHeight) / zoom) / VIEW; // source px per screen px
    const overflowX = img.naturalWidth - Math.min(img.naturalWidth, img.naturalHeight) / zoom;
    const overflowY = img.naturalHeight - Math.min(img.naturalWidth, img.naturalHeight) / zoom;
    if (overflowX > 0) setPx(Math.min(1, Math.max(0, drag.current.px - ((e.clientX - drag.current.x) * scale) / overflowX)));
    if (overflowY > 0) setPy(Math.min(1, Math.max(0, drag.current.py - ((e.clientY - drag.current.y) * scale) / overflowY)));
  };
  const onUp = () => { drag.current = null; };

  const rect = img ? sourceRect(img) : null;
  const shown = rect && img ? { w: (img.naturalWidth / rect.side) * VIEW, h: (img.naturalHeight / rect.side) * VIEW, l: -(rect.x / rect.side) * VIEW, t: -(rect.y / rect.side) * VIEW } : null;

  return (
    <Section title="Photo" description="Shown on your card. Everyone in the circle can see it, including the full size on your Progress page.">
      <div className="flex items-center gap-4">
        {avatarPhotoId ? (
          // eslint-disable-next-line @next/next/no-img-element -- our own 128 px avatar endpoint
          <img src={`/api/photos/${userId}?size=128&v=${avatarPhotoId}`} alt={`${name}'s photo`} width={64} height={64} className="size-16 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-accent/15 text-xl font-semibold text-accent-strong">{name.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="flex flex-wrap gap-2">
          <GlassButton variant="secondary" onClick={() => input.current?.click()}>{avatarPhotoId ? "Change photo" : "Add photo"}</GlassButton>
          {avatarPhotoId && <GlassButton variant="ghost" onClick={remove} disabled={status.kind === "saving"}>Remove</GlassButton>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose a photo" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {shown && src && (
        <div className="flex flex-col items-center gap-4" role="group" aria-label="Crop your photo">
          <div
            data-testid="crop-view"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            className="relative touch-none overflow-hidden rounded-3xl bg-black/5"
            style={{ width: VIEW, height: VIEW }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={src} alt="Preview of your photo" draggable={false} className="pointer-events-none absolute max-w-none select-none" style={{ width: shown.w, height: shown.h, left: shown.l, top: shown.t }} />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-white/80" />
          </div>
          <div className="grid w-full gap-3">
            {[
              ["Zoom", zoom, setZoom, 1, 3, 0.05],
              ["Move left or right", px, setPx, 0, 1, 0.01],
              ["Move up or down", py, setPy, 0, 1, 0.01],
            ].map(([label, value, set, min, max, step]) => (
              <label key={label as string} className="flex flex-col gap-1 text-sm font-medium">
                {label as string}
                <input type="range" min={min as number} max={max as number} step={step as number} value={value as number} onChange={(e) => (set as (n: number) => void)(Number(e.target.value))} className="glass-focus min-h-8 w-full accent-[var(--color-accent)]" />
              </label>
            ))}
          </div>
          <div className="flex w-full gap-2">
            <GlassButton onClick={upload} disabled={status.kind === "saving"} className="flex-1">{status.kind === "saving" ? "Uploading…" : "Use photo"}</GlassButton>
            <GlassButton variant="secondary" onClick={() => { setSrc(null); setImg(null); }} className="flex-1">Cancel</GlassButton>
          </div>
        </div>
      )}
      <span id={id} className="sr-only">Photos are cropped to a square before upload.</span>
      <div aria-live="polite">
        {status.kind === "ok" && <FormMessage kind="success">{status.text}</FormMessage>}
        {status.kind === "error" && <FormMessage kind="error">{status.text}</FormMessage>}
      </div>
    </Section>
  );
}
