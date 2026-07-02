"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { realmMotion, realmTokens } from "@/lib/theme";

type AnimatedRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: "fadeUp" | "fadeIn" | "staggerChildren";
};

export function AnimatedReveal({
  children,
  className,
  delay = 0,
  variant = "fadeUp",
}: AnimatedRevealProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={realmMotion[variant]}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: realmTokens.durations.slow / 1000,
        delay,
        ease: realmTokens.easing.smooth,
      }}
    >
      {children}
    </motion.div>
  );
}
