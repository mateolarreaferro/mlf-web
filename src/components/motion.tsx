"use client";

import { motion, type Variants } from "motion/react";
import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
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

/* a quiet arrival: a little out of focus, then sharp, with only a hint of travel */
const fadeUpFor = (tempo: number, delay = 0): Variants => ({
  hidden: { opacity: 0, y: 6, filter: "blur(3px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9 * tempo, ease, delay: delay * tempo },
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

/*
  A typewriter: text appears a character at a time behind a thin blinking
  caret, which lingers a moment and goes. The untyped rest of the text is
  already laid out, only transparent, so nothing around it reflows while it
  types. Plain DOM work on one element so the splash (which runs before
  React's tree is interactive) and the components share it. Returns a
  cancel function that leaves the full text in place.
*/
export function typewrite(
  el: HTMLElement,
  text: string,
  { perChar = 32, delay = 0 }: { perChar?: number; delay?: number } = {},
): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.classList.remove("tw-wait");
    el.textContent = text;
    return () => {};
  }
  el.classList.remove("tw-wait");
  const typed = document.createElement("span");
  const caret = document.createElement("span");
  const rest = document.createElement("span");
  caret.className = "caret";
  rest.style.color = "transparent";
  rest.textContent = text;
  el.replaceChildren(typed, caret, rest);

  let raf = 0;
  let linger = 0;
  const start = performance.now() + delay;
  const frame = (now: number) => {
    const n = Math.max(0, Math.min(text.length, Math.floor((now - start) / perChar)));
    typed.textContent = text.slice(0, n);
    rest.textContent = text.slice(n);
    if (n < text.length) raf = requestAnimationFrame(frame);
    else linger = window.setTimeout(() => caret.remove(), 900);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(linger);
    el.textContent = text;
  };
}

/*
  Text that types itself in when it appears. The server renders the real
  text, so it reads without JavaScript, and screen readers get a hidden copy
  rather than the characters arriving one by one.
*/
export function Typewriter({
  text,
  className,
  perChar = 32,
  delay = 0,
}: {
  text: string;
  className?: string;
  perChar?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const tempo = useTempo();
  // before paint, so the full text never flashes ahead of the typing
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    return typewrite(el, text, { perChar: perChar * tempo, delay: delay * tempo });
  }, [text, perChar, delay, tempo]);
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      {/* tw-wait keeps it invisible until the typing takes over (globals.css) */}
      <span ref={ref} aria-hidden className="tw-wait">
        {text}
      </span>
    </span>
  );
}
