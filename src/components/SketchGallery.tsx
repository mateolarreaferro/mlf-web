"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTempo } from "./motion";

/*
  The Sketches card: a grid of stills of Mateo's p5.js sketches, and the one
  under the pointer grows into a larger panel running the real thing.

  Each sketch is his code, unmodified, in public/sketches/<name>.js, run by
  public/sketches/run.html in an iframe (global-mode sketches would trample
  each other on one page). Only the open one runs. The frame is a fixed
  1000x1000 scaled down to the panel, so a sketch written for a full window
  keeps its composition. The stills are frames of the same sketches,
  rendered headless (see CLAUDE.md, "Sketches").

  The iframe takes no pointer events: hover is tracked here, in the page,
  where leaving the panel is reliable. On touch, or for visitors who prefer
  reduced motion, a tap opens a sketch and another closes it.
*/

export const GALLERY_RATIO = 4 / 3;

const SKETCHES: { name: string; title: string }[] = [
  { name: "poincare", title: "poincaré disk" },
  { name: "mandala", title: "mandala" },
  { name: "flow-field-squares", title: "flow field, squares" },
  { name: "noise-rings", title: "noise rings" },
  { name: "temple-glass", title: "temple glass" },
  { name: "rossler", title: "two rössler attractors" },
  { name: "triangles", title: "triangles" },
  { name: "swirl", title: "swirl" },
  { name: "shells", title: "shells" },
  { name: "flow-field", title: "flow field" },
  { name: "rounded-rects", title: "rounded rectangles" },
];

const FRAME = 1000;
const GAP = 6;
const ease = [0.22, 1, 0.36, 1] as const;

type Rect = { left: number; top: number; width: number; height: number };

export default function SketchGallery() {
  const tempo = useTempo();
  const box = useRef<HTMLDivElement>(null);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState<{ i: number; from: Rect; to: Rect } | null>(null);
  const [live, setLive] = useState(false);
  const intent = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(intent.current), []);

  const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // where the tile sits, and the larger square it grows into, kept inside the card
  const show = (i: number | null) => {
    clearTimeout(intent.current);
    setLive(false);
    const outer = box.current?.getBoundingClientRect();
    const tile = i === null ? null : tiles.current[i]?.getBoundingClientRect();
    if (i === null || !outer || !tile) return setOpen(null);
    const from = {
      left: tile.left - outer.left,
      top: tile.top - outer.top,
      width: tile.width,
      height: tile.height,
    };
    const side = Math.min(outer.width, outer.height) * 0.78;
    const clamp = (v: number, max: number) => Math.max(GAP, Math.min(max - side - GAP, v));
    const to = {
      left: clamp(from.left + from.width / 2 - side / 2, outer.width),
      top: clamp(from.top + from.height / 2 - side / 2, outer.height),
      width: side,
      height: side,
    };
    setOpen({ i, from, to });
  };

  // a mouse that rests on a tile opens it; passing over does nothing
  const hoverIn = (i: number) => (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || still()) return;
    clearTimeout(intent.current);
    intent.current = setTimeout(() => show(i), 140);
  };
  const hoverOut = () => clearTimeout(intent.current);

  const sketch = open ? SKETCHES[open.i] : null;

  return (
    <div ref={box} className="relative size-full bg-[#050505] p-1.5">
      <div className="grid size-full grid-cols-4 grid-rows-3 gap-1.5">
        {SKETCHES.map((s, i) => (
          <button
            key={s.name}
            ref={(el) => {
              tiles.current[i] = el;
            }}
            type="button"
            aria-label={`Play the sketch "${s.title}"`}
            onPointerEnter={hoverIn(i)}
            onPointerLeave={hoverOut}
            onClick={() => show(open?.i === i ? null : i)}
            className="relative cursor-pointer overflow-hidden rounded-lg bg-black"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny local stills */}
            <img
              src={`/sketches/${s.name}.jpg`}
              alt=""
              loading="lazy"
              className="size-full object-cover opacity-90 transition-opacity duration-300 hover:opacity-100"
            />
          </button>
        ))}
        <a
          href="https://www.instagram.com/3t4msketches/"
          target="_blank"
          rel="noreferrer"
          className="label flex items-center justify-center rounded-lg bg-white/5 p-2 text-center !text-white/70 transition-colors hover:!text-white"
        >
          <span>
            {/* a phone's tile is too narrow for the handle */}
            <span className="hidden sm:inline">more at @3t4msketches</span>
            <span className="sm:hidden" aria-label="more at @3t4msketches">
              more
            </span>{" "}
            ↗
          </span>
        </a>
      </div>

      <AnimatePresence>
        {sketch && open ? (
          <motion.div
            key={sketch.name}
            role="group"
            aria-label={sketch.title}
            className="absolute z-10 cursor-pointer overflow-hidden rounded-xl bg-black shadow-2xl"
            initial={{ ...open.from, opacity: 1 }}
            animate={{ ...open.to, opacity: 1 }}
            exit={{ ...open.from, opacity: 0 }}
            transition={{ duration: (still() ? 0 : 0.45) * tempo, ease }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse" && !still()) show(null);
            }}
            onClick={() => show(null)}
          >
            <iframe
              src={`/sketches/run.html?s=${sketch.name}`}
              title={sketch.title}
              sandbox="allow-scripts"
              // p5 listens for device motion; allowing it keeps the console quiet
              allow="accelerometer; gyroscope"
              tabIndex={-1}
              onLoad={() => setTimeout(() => setLive(true), 350)}
              className="pointer-events-none absolute left-1/2 top-1/2 border-0"
              style={{
                width: FRAME,
                height: FRAME,
                transform: `translate(-50%, -50%) scale(${open.to.width / FRAME})`,
              }}
            />
            {/* the still holds the place until the sketch has drawn */}
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny local stills */}
            <img
              src={`/sketches/${sketch.name}.jpg`}
              alt=""
              className={`pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-500 ${
                live ? "opacity-0" : "opacity-100"
              }`}
            />
            <p className="label pointer-events-none absolute bottom-3 left-4 !text-white/80">
              {sketch.title}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
