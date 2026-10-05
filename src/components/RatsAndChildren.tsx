"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Renderer } from "@/lib/rats-and-children/gl";
import { Sound } from "@/lib/rats-and-children/sound";
import { World } from "@/lib/rats-and-children/world";

/*
  Rats & Children, playable in its card: the ChucK/ChuGL piece ported to
  WebGL2 and Web Audio (src/lib/rats-and-children: world.ts is the rules,
  gl.ts the picture, sound.ts the sound). Press and hold to bring beings in,
  one every 0.2 s as in the original. Sound starts with the first press,
  because browsers only allow it from one. The corner button takes the piece
  full screen where the browser allows it (not iPhone Safari, which only
  lets video do that, so the button is hidden there). It pauses, sound and
  all, while the tab is hidden, and everything is torn down when the card
  closes.
*/

export default function RatsAndChildren() {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [begun, setBegun] = useState(false);
  const [full, setFull] = useState(false);
  // what this browser can do; the server (a deep link renders the card) says no to both
  const broken = useSyncExternalStore(still, noWebGL2, no);
  const canFull = useSyncExternalStore(still, fullscreenable, no);

  useEffect(() => {
    const el = canvas.current;
    const holder = box.current;
    if (!el || !holder || broken) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer(el);
    } catch {
      return;
    }

    let sound: Sound | null = null;
    const world = new World((e) => sound?.hear(e, world.beings.length));

    let held = false;
    let at: [number, number] = [0, 0];
    const point = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      at = renderer.toWorld(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      point(e);
      held = true;
      if (!sound) sound = new Sound();
      void sound.start();
      setBegun(true);
      world.press(at[0], at[1]);
    };
    const move = (e: PointerEvent) => {
      if (held) point(e);
    };
    const up = () => {
      held = false;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (held) world.press(at[0], at[1]);
      world.step(dt);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(el.clientWidth * dpr);
      const h = Math.round(el.clientHeight * dpr);
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      renderer.resize(w, h);
      renderer.draw(world);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // a hidden tab neither draws nor sings
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        sound?.suspend();
      } else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
        sound?.resume();
      }
    };
    document.addEventListener("visibilitychange", visibility);

    const fullChange = () =>
      setFull((document.fullscreenElement ?? (document as WebkitDocument).webkitFullscreenElement) === holder);
    document.addEventListener("fullscreenchange", fullChange);
    document.addEventListener("webkitfullscreenchange", fullChange);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("fullscreenchange", fullChange);
      document.removeEventListener("webkitfullscreenchange", fullChange);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      sound?.close();
      renderer.dispose();
    };
  }, [broken]);

  const toggleFull = () => {
    const holder = box.current as WebkitElement | null;
    if (!holder) return;
    const doc = document as WebkitDocument;
    if (document.fullscreenElement ?? doc.webkitFullscreenElement) {
      void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    } else {
      void (holder.requestFullscreen?.() ?? holder.webkitRequestFullscreen?.());
    }
  };

  return (
    <div ref={box} className="relative size-full bg-black">
      <canvas
        ref={canvas}
        className="block size-full touch-none select-none"
        aria-label="Rats & Children: press and hold to bring beings into the circle"
      />
      {broken ? (
        <p className="label absolute inset-0 flex items-center justify-center p-6 text-center !text-white/80">
          This piece needs WebGL2, which this browser does not offer.
        </p>
      ) : null}
      <p
        aria-hidden={begun}
        className={`label pointer-events-none absolute inset-x-0 bottom-5 text-center !text-white mix-blend-difference transition-opacity duration-700 ${
          begun ? "opacity-0" : "opacity-100"
        }`}
      >
        press and hold to bring them in · sound on
      </p>
      {canFull ? (
        <button
          type="button"
          onClick={toggleFull}
          aria-label={full ? "Leave full screen" : "Full screen"}
          className="absolute bottom-3 right-3 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/80 text-black backdrop-blur-sm transition-colors hover:bg-white"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            {full ? (
              <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
            ) : (
              <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
            )}
          </svg>
        </button>
      ) : null}
    </div>
  );
}

const still = () => () => {};
const no = () => false;
let webgl2: boolean | undefined;
const noWebGL2 = () => {
  // asked once: every probe makes a context
  webgl2 ??= Boolean(document.createElement("canvas").getContext("webgl2"));
  return !webgl2;
};
const fullscreenable = () =>
  Boolean(document.fullscreenEnabled || (document as WebkitDocument).webkitFullscreenEnabled);

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};
type WebkitElement = HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> };
