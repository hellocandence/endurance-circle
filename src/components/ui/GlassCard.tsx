"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

type GlassCardProps = HTMLMotionProps<"div"> & {
  /** Adds a spring press effect and pointer cursor. Pair with an onClick or wrap in a link. */
  interactive?: boolean;
  /** Seconds to wait before the entrance animation (used to stagger lists). */
  delay?: number;
};

// Per-state transitions: the entrance is a short ease-out (PRD: 200 to 300 ms) and the press is a spring.
// (A single `transition` prop would apply the tween to the tap as well, so the press would not spring.)
export function GlassCard({ interactive = false, delay = 0, className = "", children, ...rest }: GlassCardProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      data-motion
      initial={reduce ? false : { opacity: 0, y: 12 }} // reduced motion: render in the final state from the first frame
      animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1], delay } }}
      whileTap={interactive ? { scale: 0.98, transition: { type: "spring", stiffness: 500, damping: 30 } } : undefined}
      className={`glass rounded-(--radius-glass) p-5 ${interactive ? "hover-lift cursor-pointer" : ""} ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
