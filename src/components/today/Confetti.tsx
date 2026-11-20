"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

const COLORS = ["#4f46e5", "#f59e0b", "#10b981", "#ec4899", "#06b6d4", "#ef4444"];

type Kind = "task" | "day";
type Origin = { x: number; y: number };
type BurstSpec = { id: number; kind: Kind; origin: Origin };

type Particle = { color: string; w: number; h: number; round: boolean; dx: number; peak: number; fall: number; spin: number; delay: number; duration: number };

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** `side`: -1 shoots up and to the right (left popper), 1 up and to the left (right popper), 0 fans out around the origin. */
function makeParticles(count: number, spread: number, lift: [number, number], side: -1 | 0 | 1): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const dir = side === 0 ? rand(-1, 1) : -side * rand(0.15, 1);
    const peak = rand(lift[0], lift[1]);
    return {
      color: COLORS[i % COLORS.length],
      w: rand(5, 9),
      h: rand(8, 14),
      round: i % 3 === 0,
      dx: dir * spread,
      peak,
      fall: rand(40, 220),
      spin: rand(-540, 540),
      delay: rand(0, 0.08),
      duration: rand(1.1, 1.7),
    };
  });
}

function ParticleBurst({ origin, particles }: { origin: Origin; particles: Particle[] }) {
  return (
    <div className="absolute" style={{ left: origin.x, top: origin.y }}>
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute block"
          style={{ width: p.w, height: p.h, backgroundColor: p.color, borderRadius: p.round ? "50%" : 2 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{ x: [0, p.dx * 0.7, p.dx], y: [0, -p.peak, p.fall], opacity: [1, 1, 0], rotate: p.spin, scale: [1, 1, 0.7] }}
          transition={{ duration: p.duration, delay: p.delay, times: [0, 0.4, 1], ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

function Burst({ spec, onDone }: { spec: BurstSpec; onDone: (id: number) => void }) {
  const [parts] = useState(() => {
    if (spec.kind === "task") return { all: [{ origin: spec.origin, particles: makeParticles(22, 130, [60, 140], 0) }] };
    const w = typeof window === "undefined" ? 400 : window.innerWidth;
    const h = typeof window === "undefined" ? 700 : window.innerHeight;
    return {
      all: [
        { origin: { x: 8, y: h - 8 }, particles: makeParticles(46, w * 0.7, [h * 0.35, h * 0.8], -1) },
        { origin: { x: w - 8, y: h - 8 }, particles: makeParticles(46, w * 0.7, [h * 0.35, h * 0.8], 1) },
      ],
    };
  });
  useEffect(() => {
    const t = setTimeout(() => onDone(spec.id), 2200);
    return () => clearTimeout(t);
  }, [spec.id, onDone]);
  return (
    <>
      {parts.all.map((p, i) => <ParticleBurst key={i} origin={p.origin} particles={p.particles} />)}
      {spec.kind === "day" && (
        <motion.p
          className="absolute left-1/2 top-1/3 -translate-x-1/2 text-center text-6xl"
          initial={{ scale: 0, opacity: 0, rotate: -12 }}
          animate={{ scale: [0, 1.25, 1, 1], opacity: [0, 1, 1, 0], rotate: [-12, 6, 0, 0] }}
          transition={{ duration: 1.8, times: [0, 0.2, 0.35, 1] }}
        >
          🎉
        </motion.p>
      )}
    </>
  );
}

/**
 * Party-popper celebrations: a small burst from the task you just finished, and a big popper from both
 * bottom corners (with a 🎉) when the whole day is complete. Drawn with Framer Motion, no extra library.
 * Skipped entirely when the OS asks for reduced motion.
 */
export function useConfetti() {
  const reduce = useReducedMotion();
  const [bursts, setBursts] = useState<BurstSpec[]>([]);
  const seq = useRef(0);

  const fire = useCallback(
    (kind: Kind, origin?: Origin) => {
      if (reduce) return;
      try {
        navigator.vibrate?.(kind === "day" ? [30, 40, 30] : 12);
      } catch {
        /* haptics are optional */
      }
      const fallback = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
      setBursts((b) => [...b.slice(-4), { id: ++seq.current, kind, origin: origin ?? fallback }]);
    },
    [reduce],
  );
  const done = useCallback((id: number) => setBursts((b) => b.filter((x) => x.id !== id)), []);

  const layer = (
    <div data-testid="confetti" aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {bursts.map((b) => <Burst key={b.id} spec={b} onDone={done} />)}
    </div>
  );
  return { fire, layer, active: bursts.length > 0 };
}
