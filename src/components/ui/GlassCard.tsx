"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

type GlassCardProps = HTMLMotionProps<"div"> & {
  /** Adds a spring press effect and pointer cursor. Pair with an onClick or wrap in a link. */
  interactive?: boolean;
};

export function GlassCard({ interactive = false, className = "", children, ...rest }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      whileTap={interactive ? { scale: 0.98 } : undefined}
      className={`glass rounded-(--radius-glass) p-5 ${interactive ? "cursor-pointer" : ""} ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
