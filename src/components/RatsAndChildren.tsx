"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Renderer } from "@/lib/rats-and-children/gl";
import { EMPTY_STATS, settings, stats } from "@/lib/rats-and-children/live";
import { Sound } from "@/lib/rats-and-children/sound";
import { World } from "@/lib/rats-and-children/world";
import FullscreenButton, { useFullscreen } from "./FullscreenButton";

/*
  Rats & Children, playable in its card: the ChucK/ChuGL piece ported to
  WebGL2 and Web Audio (src/lib/rats-and-children: world.ts is the rules,
  gl.ts the picture, sound.ts the sound). It opens on a short card of
  instructions whose button is the press browsers require before sound;
  after that, press and hold to bring beings in, one every 0.2 s as in the
  original. The panel in the left column (RatsPanel) reads what happens
  and sets the controls through live.ts. The corner button takes the piece
  full screen where the browser allows it. It pauses, sound and all, while
  the tab is hidden, and everything is torn down when the card closes.
*/

const STEPS = [
  "Press and hold anywhere in the grey circle to bring someone in.",
  "A red and a yellow who meet have a child.",
  "Outside the grey circle nothing lives, and now and then a black circle falls.",
  "As the crowd grows, the people, the city and a beat arrive.",
];

export default function RatsAndChildren() {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const begin = useRef<() => void>(() => {});
  const [begun, setBegun] = useState(false);
  const broken = useSyncExternalStore(still, noWebGL2, no);
  const { can, full, toggle } = useFullscreen(box);

  useEffect(() => {
    const el = canvas.current;
    if (!el || broken) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer(el);
    } catch {
      return;
    }

    let sound: Sound | null = null;
    const world = new World((e) => sound?.hear(e, world.beings.length));
    let started = false;

    const apply = () => {
      const s = settings.get();
      world.disasterRate = s.disasters;
      sound?.setTone(s.tone);
      sound?.setVolume(s.volume);
      sound?.setListen(s.listen);
    };
    apply();
    const unsubscribe = settings.subscribe(apply);

    begin.current = () => {
      if (started) return;
      started = true;
      sound = new Sound();
      apply();
      void sound.start();
      setBegun(true);
    };

    let held = false;
    let at: [number, number] = [0, 0];
    const point = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      at = renderer.toWorld(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    };
    const down = (e: PointerEvent) => {
      if (!started) return;
      el.setPointerCapture(e.pointerId);
      point(e);
      held = true;
      void sound?.start();
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

    // what the panel shows: five times a second, and the head count once a second
    const history: number[] = [];
    let lastSample = -1;
    let lastPublish = 0;
    const publish = (now: number) => {
      if (now - lastPublish < 200) return;
      lastPublish = now;
      const second = Math.floor(world.t);
      if (second !== lastSample) {
        lastSample = second;
        history.push(world.beings.length);
        if (history.length > 60) history.shift();
      }
      const living = world.beings.filter((b) => !b.shrinking);
      const state = sound?.state ?? { voices: 0, layers: [] };
      stats.set({
        playing: started,
        red: living.filter((b) => b.red).length,
        yellow: living.filter((b) => !b.red).length,
        normal: living.filter((b) => b.category === 0).length,
        small: living.filter((b) => b.category === 1).length,
        tiny: living.filter((b) => b.category === 2).length,
        ...world.count,
        sky: world.sky,
        ring: world.ringR / 2.4,
        voices: state.voices,
        layers: state.layers,
        history: [...history],
      });
    };

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * settings.get().speed;
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
      publish(now);
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

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      sound?.close();
      renderer.dispose();
      stats.set(EMPTY_STATS);
    };
  }, [broken]);

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

      {/* the instructions, over the piece already moving behind them */}
      {!broken ? (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[3px] transition-opacity duration-700 ${
            begun ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={begun}
        >
          <div className="max-w-xs text-white">
            <p className="text-lg font-medium tracking-[-0.02em]">Rats &amp; Children</p>
            <ol className="mt-3 space-y-1.5 text-sm leading-relaxed text-white/75">
              {STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => begin.current()}
              tabIndex={begun ? -1 : 0}
              className="label mt-5 inline-flex min-h-10 cursor-pointer items-center rounded-full bg-white px-5 !text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              begin · sound on
            </button>
          </div>
        </div>
      ) : null}

      {can ? <FullscreenButton full={full} onClick={toggle} /> : null}
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
