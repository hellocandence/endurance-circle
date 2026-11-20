"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

type Variant = "primary" | "secondary" | "ghost";

type GlassButtonProps = HTMLMotionProps<"button"> & {
  variant?: Variant;
};

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-glass-press hover:bg-accent-strong",
  secondary: "glass text-ink hover:bg-glass-strong",
  ghost: "text-accent-strong hover:bg-glass",
};

export function GlassButton({
  variant = "primary",
  type = "button",
  className = "",
  children,
  ...rest
}: GlassButtonProps) {
  return (
    <motion.button
      type={type}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={`glass-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-base font-medium transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
