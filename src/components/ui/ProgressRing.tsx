"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type ProgressRingProps = {
  /** 0 to 100 */
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
};

export function ProgressRing({ value, size = 96, stroke = 10, label, children }: ProgressRingProps) {
  const reduce = useReducedMotion();
  const pct = Math.min(100, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const center = size / 2;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="rgb(79 70 229 / 0.15)" strokeWidth={stroke} />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ opacity: pct === 0 ? 0 : 1 }} // hide the round-cap dot at 0%
          initial={{ pathLength: 0 }}
          animate={{ pathLength: pct / 100 }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center font-semibold text-ink">
        {children ?? `${Math.round(pct)}%`}
      </div>
    </div>
  );
}
