"use client";

import { useEffect, useRef, useState } from "react";
import { currentMood } from "@/lib/mood";
import { NIGHT_TEMPO, typewrite } from "./motion";
import { markSplashSeen, splashSeen } from "@/lib/intro";

/*
  The name, alone on the paper, before the page. It types itself out once
  the script runs (`typewrite` in motion.tsx; the text waits transparent
  until then, so it never flashes in whole first), then blurs away in
  place, the paper behind it thins out, and the page is simply there. (It
  used to glide diagonally into the header wordmark; Mateo didn't like the
  movement.)

  Server-rendered from the layout (outside template.tsx, whose transform would
  pin it to the page instead of the viewport) so it covers everything from the
  first frame, on every route; INTRO_SCRIPT (lib/intro.ts) hides it before
  paint everywhere but "/" and once seen. A press or a key skips to the fade.
*/
const NAME = "mateo larrea ferro";
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
    const stop = typewrite(name, NAME, { perChar: 55 * tempo, delay: 150 * tempo });
    let leaving = false;
    let finish = 0;

    const done = () => {
      markSplashSeen();
      setGone(true);
    };

    // no travel: the name thins out in place a beat ahead of the paper
    const leave = () => {
      if (leaving) return;
      leaving = true;
      window.clearTimeout(hold);
      const fade = (still ? 450 : 800) * tempo;
      if (!still)
        name.animate(
          { opacity: [1, 0], filter: ["blur(0px)", "blur(6px)"] },
          { duration: fade * 0.7, easing: ease, fill: "forwards" },
        );
      paper.parentElement?.animate(
        { opacity: [1, 0] },
        { duration: fade, delay: still ? 0 : 150 * tempo, easing: ease, fill: "forwards" },
      );
      finish = window.setTimeout(done, fade + (still ? 0 : 150 * tempo));
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
      stop();
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
        className="tw-wait relative whitespace-nowrap text-[clamp(1.75rem,5vw,2.4rem)] font-medium tracking-tight text-ink"
      >
        {NAME}
      </p>
    </div>
  );
}
