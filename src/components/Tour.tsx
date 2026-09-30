"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { hoverSpring, useTempo } from "./motion";
import {
  SPLASH_DONE_EVENT,
  TOUR_EVENT,
  TOUR_NOW_KEY,
  markToured,
  splashSeen,
  toured,
} from "@/lib/intro";

/*
  The first-visit tour: a few steps that point at the parts of the page a
  visitor would otherwise have to discover. Each step lights one thing and
  lets the rest of the page sink under a veil of paper (a huge soft
  box-shadow around a rounded hole, no borders), with a small card beside it.

  Targets are found by `data-tour` attributes, so the tour never reaches into
  a component's internals. The photo has no element of its own (it is drawn
  on the canvas, pinned at the centre), so its step lights a circle in the
  middle of the graph box. A step whose target is missing or hidden (the
  weather line below `sm`) is skipped.

  Runs once per browser after the splash lifts; the nav's "tour" replays it.
  → / Enter go on, ← goes back, Esc leaves.
*/

type Step = {
  target: string;
  shape?: "centre";
  /* a long section: light only its top, enough to show what it is */
  clip?: boolean;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    target: "graph",
    title: "the work",
    body: "every dot is a project, coloured by kind. press one to open it; ✕ or esc brings you back.",
  },
  {
    target: "graph-box",
    shape: "centre",
    title: "ask my agent",
    body: "press my photo to talk to an agent that knows the projects and the research. en español también.",
  },
  {
    target: "research",
    clip: true,
    title: "the research",
    body: "papers, talks and classes. the tabs switch between them.",
  },
  {
    target: "thoughts",
    clip: true,
    title: "thoughts",
    body: "writing, in english and spanish.",
  },
  {
    target: "room",
    title: "the room",
    body: "the colours come from the weather where you are, and the page goes dark at night. the sun / moon switches it.",
  },
];

type Box = { x: number; y: number; w: number; h: number; r: number };
type Place = { box: Box; card: { x: number; y: number }; span: [number, number] };

const PAD = 14;
const GAP = 16;
const EDGE = 16;
const ease = [0.22, 1, 0.36, 1] as const;

function visible(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

const find = (step: Step) => document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);

/*
  Where the light and the card go, in document coordinates, so both ride the
  page's own scroll instead of chasing it. The card sits beside the lit box
  when there is room (the graph, next to the dimmed hero), else below it,
  else tucked inside its bottom edge. `span` is what has to be on screen.
*/
function place(step: Step, el: HTMLElement, cw: number, ch: number): Place {
  const r = el.getBoundingClientRect();
  const sx = window.scrollX;
  const sy = window.scrollY;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;

  let box: Box;
  if (step.shape === "centre") {
    const d = Math.max(150, Math.min(240, Math.min(r.width, r.height) * 0.42));
    box = { x: sx + r.left + r.width / 2 - d / 2, y: sy + r.top + r.height / 2 - d / 2, w: d, h: d, r: d / 2 };
  } else {
    const small = r.height < 60;
    const pad = small ? 8 : PAD;
    const max = step.clip ? vh * 0.4 : vh - 2 * (EDGE + pad);
    const h = Math.min(r.height, max) + pad * 2;
    box = { x: sx + r.left - pad, y: sy + r.top - pad, w: r.width + pad * 2, h, r: small ? h / 2 : 24 };
  }

  const clampX = (x: number) => Math.max(sx + EDGE, Math.min(sx + vw - cw - EDGE, x));
  const left = box.x - GAP - cw;
  if (!step.shape && box.h > ch * 2 && left >= sx + EDGE) {
    const y = box.y + box.h / 2 - ch / 2;
    return { box, card: { x: left, y }, span: [box.y, box.y + box.h] };
  }
  const x = clampX(box.x + box.w / 2 - cw / 2);
  if (box.h + GAP + ch <= vh - 2 * EDGE) {
    const y = box.y + box.h + GAP;
    return { box, card: { x, y }, span: [box.y, y + ch] };
  }
  const y = box.y + box.h - ch - EDGE;
  return { box, card: { x, y }, span: [box.y, box.y + box.h] };
}

const noop = () => () => {};
const same = (a: number, b: number) => Math.abs(a - b) < 0.5;

export default function Tour() {
  const [step, setStep] = useState<number | null>(null);
  const [at, setAt] = useState<Place | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const tempo = useTempo();
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  // the steps whose targets are on the page right now
  const [steps, setSteps] = useState<Step[]>(STEPS);

  const start = useCallback(() => {
    const here = STEPS.filter((s) => visible(find(s)));
    if (here.length === 0) return;
    setSteps(here);
    setStep(0);
  }, []);

  const close = useCallback(() => {
    markToured();
    setStep(null);
    setAt(null);
  }, []);

  // when to begin: after the splash on a first visit, or on request
  useEffect(() => {
    let wait = 0;
    const soon = () => {
      // let the entry animations settle before pointing at anything
      wait = window.setTimeout(start, 700);
    };
    const afterSplash = () => {
      if (!toured()) soon();
    };
    let asked = false;
    try {
      asked = sessionStorage.getItem(TOUR_NOW_KEY) !== null;
      sessionStorage.removeItem(TOUR_NOW_KEY);
    } catch {}
    if (asked) soon();
    else if (splashSeen()) afterSplash();
    else window.addEventListener(SPLASH_DONE_EVENT, afterSplash, { once: true });

    window.addEventListener(TOUR_EVENT, start);
    return () => {
      window.clearTimeout(wait);
      window.removeEventListener(SPLASH_DONE_EVENT, afterSplash);
      window.removeEventListener(TOUR_EVENT, start);
    };
  }, [start]);

  const current = step === null ? null : steps[step];

  const measure = useCallback((): Place | null => {
    const el = current && find(current);
    const c = cardRef.current;
    if (!current || !el || !visible(el)) return null;
    return place(current, el, c?.offsetWidth ?? 320, c?.offsetHeight ?? 180);
  }, [current]);

  // bring the step into view, centred if it fits and from its top if not
  useEffect(() => {
    if (!current) return;
    const p = measure();
    if (!p) return;
    const vh = window.innerHeight;
    const [top, bottom] = p.span;
    const y = bottom - top <= vh - 2 * EDGE ? top - (vh - (bottom - top)) / 2 : top - EDGE;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, y), behavior: still ? "auto" : "smooth" });
    nextRef.current?.focus({ preventScroll: true });
  }, [current, measure]);

  // follow the target while open: reveals and resizes move it
  useLayoutEffect(() => {
    if (!current) return;
    let raf = 0;
    const follow = () => {
      const p = measure();
      if (p)
        setAt((prev) =>
          prev &&
          same(prev.box.x, p.box.x) &&
          same(prev.box.y, p.box.y) &&
          same(prev.box.w, p.box.w) &&
          same(prev.box.h, p.box.h) &&
          same(prev.card.x, p.card.x) &&
          same(prev.card.y, p.card.y)
            ? prev
            : p,
        );
      raf = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(raf);
  }, [current, measure]);

  const go = useCallback(
    (d: number) => {
      if (step === null) return;
      const n = step + d;
      if (n < 0) return;
      if (n >= steps.length) close();
      else setStep(n);
    },
    [step, steps.length, close],
  );

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // the page's own Esc (closing a project) has nothing to close here
        e.stopImmediatePropagation();
        close();
      } else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step, go, close]);

  const open = current !== null;
  const last = step !== null && step === steps.length - 1;
  const t = { duration: 0.6 * tempo, ease };

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="tour"
          className="absolute left-0 top-0 z-[90] w-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 * tempo, ease }}
        >
          {/* the page stays scrollable but not pressable while the tour is up */}
          <div className="fixed inset-0" onPointerDown={(e) => e.preventDefault()} />

          {/* the veil: everything outside the lit box sinks under the paper */}
          {at ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute left-0 top-0"
              initial={false}
              animate={{ x: at.box.x, y: at.box.y, width: at.box.w, height: at.box.h, borderRadius: at.box.r }}
              transition={t}
              style={{
                boxShadow:
                  "0 0 0 400vmax color-mix(in srgb, var(--paper) 78%, transparent), 0 0 40px 8px color-mix(in srgb, var(--paper) 60%, transparent)",
              }}
            />
          ) : null}

          <motion.div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
            aria-describedby="tour-body"
            className="absolute left-0 top-0 w-[min(20rem,calc(100vw-2rem))] rounded-3xl bg-paper p-5 shadow-2xl"
            initial={false}
            animate={at ? { x: at.card.x, y: at.card.y, opacity: 1 } : { opacity: 0 }}
            transition={t}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                transition={{ duration: 0.3 * tempo, ease }}
              >
                <p id="tour-title" className="text-lg font-light tracking-tight">
                  {current.title}
                </p>
                <p id="tour-body" className="mt-1.5 text-sm text-faint">
                  {current.body}
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-5 flex items-center gap-2">
              <div className="flex items-center gap-1.5" aria-label={`step ${step! + 1} of ${steps.length}`}>
                {steps.map((s, i) => (
                  <span
                    key={s.target + s.title}
                    className={`inline-block size-1.5 rounded-full transition-colors duration-300 ${
                      i === step ? "bg-ink" : "bg-faint/35"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={close}
                className="label ml-auto cursor-pointer rounded-full px-2.5 py-1.5 hover:!text-accent"
              >
                skip
              </button>
              {step! > 0 ? (
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="back"
                  className="label cursor-pointer rounded-full bg-soft px-3 py-1.5 hover:!text-accent"
                >
                  ←
                </button>
              ) : null}
              <motion.button
                ref={nextRef}
                type="button"
                onClick={() => go(1)}
                className="cursor-pointer rounded-full bg-ink px-4 py-1.5 text-sm text-paper"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                transition={hoverSpring(tempo)}
              >
                {last ? "done" : "next →"}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
