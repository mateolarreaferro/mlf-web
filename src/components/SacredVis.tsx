"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Stage } from "@/lib/pieces/gl";
import { controls, reading, SacredSound, SacredVis as Piece, setControl, VIEW_R, type Source } from "@/lib/sacredvis/sacredvis";
import FullscreenButton, { useFullscreen } from "./FullscreenButton";

/*
  SacredVis, playable in its card (the piece is src/lib/sacredvis). It opens
  on a short card of instructions with two ways in: the microphone, or a
  recording for anyone who would rather not share one. The press is also
  what browsers need before sound or a microphone. The panel in the left
  column (SacredVisPanel) follows the sound and has the controls.
*/

const STEPS = [
  "Sound becomes a spiral: low frequencies near the centre in blue, high ones outward to red.",
  "The louder it gets, the more the spiral folds into star shapes.",
  "Sparks orbit out from the loudest band; a white line draws the waveform.",
];

export default function SacredVis() {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const start = useRef<(s: Source) => Promise<void>>(async () => {});
  const [begun, setBegun] = useState(false);
  const [denied, setDenied] = useState(false);
  const broken = useSyncExternalStore(still, noWebGL2, no);
  const { can, full, toggle } = useFullscreen(box);

  useEffect(() => {
    const el = canvas.current;
    if (!el || broken) return;
    let stage: Stage;
    try {
      stage = new Stage(el, VIEW_R);
    } catch {
      return;
    }

    let sound: SacredSound | null = null;
    let piece: Piece | null = null;

    const connect = async (s: Source) => {
      if (!sound) {
        sound = new SacredSound();
        piece = new Piece(sound.analyser);
      }
      const ok = await sound.use(s);
      if (!ok) {
        setDenied(true);
        reading.set({ ...reading.get(), denied: true });
        return false;
      }
      setDenied(false);
      sound.apply(controls.get());
      return true;
    };
    start.current = async (s) => {
      if (await connect(s)) {
        setControl("source", s);
        setBegun(true);
      }
    };

    let current = controls.get().source;
    const unsubscribe = controls.subscribe(() => {
      const c = controls.get();
      // a press on the panel before the piece's own buttons starts it too
      if (!sound) {
        current = c.source;
        void start.current(c.source);
        return;
      }
      sound.apply(c);
      if (sound && c.source !== current) {
        current = c.source;
        void connect(c.source);
      }
    });

    let raf = 0;
    let last = performance.now();
    let lastPublish = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(el.clientWidth * dpr);
      const h = Math.round(el.clientHeight * dpr);
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      stage.resize(w, h);
      if (piece) {
        piece.step(dt, controls.get());
        piece.draw(stage);
      } else {
        stage.render([0, 0, 0], { threshold: 1, intensity: 0 });
      }
      if (piece && now - lastPublish > 150) {
        lastPublish = now;
        reading.set({
          playing: true,
          source: controls.get().source,
          level: piece.level,
          peakHz: piece.peakHz,
          step: piece.angleStep,
          sparks: piece.sparkCount,
          denied: false,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const visibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", visibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", visibility);
      unsubscribe();
      sound?.close();
      stage.dispose();
      reading.set({ playing: false, source: null, level: 0, peakHz: 0, step: 0, sparks: 0, denied: false });
    };
  }, [broken]);

  return (
    <div ref={box} className="relative size-full bg-black">
      <canvas ref={canvas} className="block size-full select-none" aria-label="SacredVis: sound drawn as a spiral" />
      {broken ? (
        <p className="label absolute inset-0 flex items-center justify-center p-6 text-center !text-white/80">
          This piece needs WebGL2, which this browser does not offer.
        </p>
      ) : null}
      {!broken ? (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[3px] transition-opacity duration-700 ${
            begun ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={begun}
        >
          <div className="max-w-xs text-white">
            <p className="text-lg font-medium tracking-[-0.02em]">SacredVis</p>
            <ol className="mt-3 space-y-1.5 text-sm leading-relaxed text-white/75">
              {STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void start.current("microphone")}
                tabIndex={begun ? -1 : 0}
                className="label inline-flex min-h-10 cursor-pointer items-center rounded-full bg-white px-5 !text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                use the microphone
              </button>
              <button
                type="button"
                onClick={() => void start.current("recording")}
                tabIndex={begun ? -1 : 0}
                className="label inline-flex min-h-10 cursor-pointer items-center rounded-full bg-white/15 px-5 !text-white transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                play a recording · sound on
              </button>
            </div>
            {denied ? (
              <p className="label mt-3 !text-white/70">The microphone was not allowed. Try the recording instead.</p>
            ) : null}
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
  webgl2 ??= Boolean(document.createElement("canvas").getContext("webgl2"));
  return !webgl2;
};
