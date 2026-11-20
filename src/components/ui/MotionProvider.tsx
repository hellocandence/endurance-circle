"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

// "user" makes Framer Motion drop transform/layout animation when the OS asks for reduced motion.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
