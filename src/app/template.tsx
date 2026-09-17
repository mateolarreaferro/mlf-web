"use client";

import { MotionConfig, motion } from "motion/react";
import type { ReactNode } from "react";
import { useTempo } from "@/components/motion";

/* Re-mounts on every route change: soft slide-and-fade between pages. */
export default function Template({ children }: { children: ReactNode }) {
  const tempo = useTempo();
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 * tempo, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
