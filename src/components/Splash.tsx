"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { currentMood } from "@/lib/mood";
import { NIGHT_TEMPO } from "./motion";
import { markSplashSeen, splashSeen } from "@/lib/intro";

/*
  The name, alone on the paper, before the page. The words rise in CSS so they
  start at first paint rather than at hydration; then the name glides up into
  the header wordmark (same face, same weight, so the hand-off is invisible)
  while the paper behind it thins away, and the page is simply there.

  Server-rendered from the layout (outside template.tsx, whose transform would
  pin it to the page instead of the viewport) so it covers everything from the
  first frame, on every route; INTRO_SCRIPT hides it everywhere but "/". Whether it plays
  at all is settled before paint by INTRO_SCRIPT in lib/intro.ts. A press or
  a key skips straight to the glide.
*/
const WORDS = ["mateo", "larrea", "ferro"];
const ease = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function Splash() {
  const [gone, setGone] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // already seen: the stylesheet keeps it hidden, and the tour reads that itself
    if (splashSeen()) return;
    const paper = paperRef.current;
    const name = nameRef.current;
    if (!paper || !name) return;

    const tempo = currentMood() === "dark" ? NIGHT_TEMPO : 1;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let leaving = false;
    let finish = 0;

    const done = () => {
      markSplashSeen();
      setGone(true);
    };

    const leave = () => {
      if (leaving) return;
      leaving = true;
      window.clearTimeout(hold);
      const target = document.querySelector<HTMLElement>("[data-wordmark]");
      const to = target?.getBoundingClientRect();
      const from = name.getBoundingClientRect();

      if (still || !to || to.width === 0) {
        const fade = 450 * tempo;
        paper.parentElement?.animate({ opacity: [1, 0] }, { duration: fade, easing: ease, fill: "forwards" });
        finish = window.setTimeout(done, fade);
        return;
      }

      const glide = 900 * tempo;
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const scale = to.width / from.width;
      name.animate(
        { transform: ["none", `translate(${dx}px, ${dy}px) scale(${scale})`] },
        { duration: glide, easing: ease, fill: "forwards" },
      );
      paper.animate(
        { opacity: [1, 0] },
        { duration: 700 * tempo, delay: 250 * tempo, easing: ease, fill: "forwards" },
      );
      finish = window.setTimeout(done, glide + 60);
    };

    // the words finish rising at ~1.2s; let the name sit a moment before leaving
    const elapsed = performance.now();
    const hold = window.setTimeout(leave, Math.max(0, (still ? 1100 : 1900) * tempo - elapsed));

    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.metaKey || e.ctrlKey || e.altKey)) return;
      leave();
    };
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(finish);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, []);

  if (gone) return null;

  return (
    <div className="splash fixed inset-0 z-[100] flex items-center justify-center" aria-hidden>
      <div ref={paperRef} className="absolute inset-0 bg-paper" />
      <p
        ref={nameRef}
        className="relative whitespace-nowrap text-[clamp(1.75rem,5vw,2.4rem)] font-light tracking-tight text-ink"
      >
        {WORDS.map((w, i) => (
          <span key={w} className="splash-word" style={{ "--i": i } as CSSProperties}>
            {w}
            {i < WORDS.length - 1 ? " " : null}
          </span>
        ))}
      </p>
    </div>
  );
}
