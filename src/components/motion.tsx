"use client";

import { motion, type Variants } from "motion/react";
import { useSyncExternalStore, type ReactNode } from "react";
import { currentMood, subscribe, type Mood } from "@/lib/mood";

const ease = [0.22, 1, 0.36, 1] as const;

/*
  Tempo. After dark everything that moves takes a quarter longer: reveals,
  the word-by-word headline, the hover springs, the card's entrance. The
  wash drift already slows at night in weather-theme.ts and the CSS
  animations read `--tempo` from globals.css; this is the same idea for
  motion's JS animations. Read the mood through a store subscription so the
  tempo follows a mood change without remounting anything. The server has no
  mood, so it answers "light" and the first frame after hydration corrects it.
*/
export const NIGHT_TEMPO = 1.25;
const readMood = () => currentMood();
const serverMood = (): Mood => "light";

export function useTempo(): number {
  const mood = useSyncExternalStore(subscribe, readMood, serverMood);
  return mood === "dark" ? NIGHT_TEMPO : 1;
}

/* the one hover/press spring, slackened by the tempo */
export function hoverSpring(tempo: number, damping = 18) {
  return { type: "spring" as const, stiffness: 400 / tempo, damping };
}

const fadeUpFor = (tempo: number, delay = 0): Variants => ({
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7 * tempo, ease, delay: delay * tempo },
  },
});

/* Reveals its children once when scrolled into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  margin = "0px 0px -80px 0px",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  /* shrink the trigger area less for things that sit right at the fold */
  margin?: string;
}) {
  const tempo = useTempo();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin }}
      variants={fadeUpFor(tempo, delay)}
    >
      {children}
    </motion.div>
  );
}

/* Parent that staggers every <Item> inside it as it enters the viewport. */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const tempo = useTempo();
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08 * tempo } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function Item({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const tempo = useTempo();
  return (
    <motion.div className={className} variants={fadeUpFor(tempo)}>
      {children}
    </motion.div>
  );
}

/* Word-by-word rise for headlines. */
export function AnimatedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const tempo = useTempo();
  const words = text.split(" ");
  return (
    <motion.span
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 * tempo } } }}
      aria-label={text}
    >
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.1em] -mb-[0.1em] align-bottom">
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: "110%" },
              show: { y: 0, transition: { duration: 0.8 * tempo, ease } },
            }}
            aria-hidden
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </motion.span>
  );
}
