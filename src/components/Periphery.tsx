"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Stage } from "@/lib/pieces/gl";
import {
  breathSeconds,
  controls,
  MAX_R,
  MIN_R,
  Periphery as Piece,
  PeripherySound,
  reading,
  setControl,
  VIEW_R,
  AMBIENCES,
} from "@/lib/periphery/periphery";
import FullscreenButton, { useFullscreen } from "./FullscreenButton";

/*
  Periphery, playable in its card (the piece is src/lib/periphery). It opens
  on a short card of instructions whose button is the press browsers need
  before sound. The pads at the left and the scroll wheel work as in the
  original; the panel in the left column (PeripheryPanel) has the same
  controls and follows the breath.

  "Keep it in a corner" pops the breath out into a small always-on-top
  window (Document Picture-in-Picture, Chrome and Edge on a computer), so
  it floats over whatever else is on screen, which is what the piece is
  for. While that window is open it keeps the clock, so the breath and its
  sounds go on even when this tab is hidden. The browser extension in
  /extensions/periphery is the same idea for every page you browse.
*/

const STEPS = [
  "Breathe with the circle: in as it grows, out as it shrinks.",
  "Scroll over it, or use the depth slider, to make the breath deeper and slower.",
  "The pads on the left: four ambiences, and two that add a sound at each turn.",
  "Keep it in a corner while you work.",
];

type PipWindow = Window & { document: Document };
type PipApi = { requestWindow(o: { width: number; height: number }): Promise<PipWindow> };
const pipApi = () => (window as Window & { documentPictureInPicture?: PipApi }).documentPictureInPicture;

export default function Periphery() {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const begin = useRef<() => void>(() => {});
  const popOut = useRef<() => void>(() => {});
  const [begun, setBegun] = useState(false);
  const [popped, setPopped] = useState(false);
  const broken = useSyncExternalStore(still, noWebGL2, no);
  const canPip = useSyncExternalStore(still, () => Boolean(pipApi()), no);
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

    let sound: PeripherySound | null = null;
    // the word cross-fades at each turn instead of snapping
    let swap = 0;
    const piece = new Piece((phase) => {
      const w = word.current;
      if (w) {
        window.clearTimeout(swap);
        w.style.opacity = "0";
        swap = window.setTimeout(() => {
          w.textContent = phase;
          w.style.opacity = "1";
        }, 250);
      }
      const c = controls.get();
      c.breathSounds.forEach((on, pad) => on && sound?.breath(pad, phase));
    });

    let lastAmbience = -1;
    const apply = () => {
      const c = controls.get();
      // a press on the panel before "begin" starts the piece too
      if (!sound) begin.current();
      if (c.ambience !== lastAmbience) {
        lastAmbience = c.ambience;
        piece.setAmbience(c.ambience);
        sound?.ambience(c.ambience);
      }
      sound?.setVolume(c.volume);
    };
    const unsubscribe = controls.subscribe(apply);

    begin.current = () => {
      if (sound) return;
      sound = new PeripherySound();
      void sound.start();
      sound.setVolume(controls.get().volume);
      sound.ambience(controls.get().ambience);
      setBegun(true);
    };

    // the pads and the wheel, as in the original
    const padAt = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const [x, y] = stage.toWorld(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      const hit = piece.pads(stage).find((p) => Math.abs(x - p.x) <= p.half && Math.abs(y - p.y) <= p.half);
      return hit ?? null;
    };
    const move = (e: PointerEvent) => {
      const p = padAt(e);
      piece.hovered = p ? (p.kind === "ambience" ? p.i : 100 + p.i) : -1;
      el.style.cursor = p ? "pointer" : "default";
    };
    const down = (e: PointerEvent) => {
      if (!sound) return;
      const p = padAt(e);
      if (!p) return;
      const c = controls.get();
      if (p.kind === "ambience") setControl("ambience", c.ambience === p.i ? -1 : p.i);
      else {
        const next: [boolean, boolean] = [...c.breathSounds];
        next[p.i] = !next[p.i];
        setControl("breathSounds", next);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = controls.get().depth - e.deltaY * 0.002;
      setControl("depth", Math.max(MIN_R, Math.min(MAX_R, d)));
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", down);
    el.addEventListener("wheel", wheel, { passive: false });

    // what the panel shows: ten breath samples a second
    const history: number[] = [];
    let lastPublish = 0;
    const publish = (now: number) => {
      if (now - lastPublish < 100) return;
      lastPublish = now;
      const c = controls.get();
      history.push(piece.r);
      if (history.length > 200) history.shift();
      reading.set({
        playing: Boolean(sound),
        phase: piece.phase,
        breaths: piece.breaths,
        seconds: breathSeconds(c.depth, c.pace),
        fill: Math.max(0, Math.min(1, (piece.r - MIN_R * 0.6) / (piece.depth - MIN_R * 0.6))),
        history: [...history],
      });
    };

    // one clock: this tab's frames, or the corner window's while it is open
    let pip: PipWindow | null = null;
    let pipCanvas: HTMLCanvasElement | null = null;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const c = controls.get();
      piece.step(dt, c);
      publish(now);
      if (!document.hidden) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(el.clientWidth * dpr);
        const h = Math.round(el.clientHeight * dpr);
        if (el.width !== w || el.height !== h) {
          el.width = w;
          el.height = h;
        }
        stage.resize(w, h);
        piece.draw(stage, c);
      }
      if (pip && pipCanvas) drawCorner(pipCanvas, piece, c);
    };
    // always this page's clock: the corner window's frames carry timestamps
    // from its own origin, and mixing the two ran the breath backwards
    const loop = () => {
      tick(performance.now());
      raf = (pip ?? window).requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    popOut.current = async () => {
      const api = pipApi();
      if (!api || pip) return;
      begin.current();
      const win = await api.requestWindow({ width: 220, height: 220 });
      win.document.body.style.cssText = "margin:0;background:#000;overflow:hidden";
      win.document.title = "Periphery";
      const c2 = win.document.createElement("canvas");
      c2.style.cssText = "display:block;width:100vw;height:100vh";
      win.document.body.appendChild(c2);
      cancelAnimationFrame(raf);
      pip = win;
      pipCanvas = c2;
      setPopped(true);
      last = performance.now();
      raf = win.requestAnimationFrame(loop);
      win.addEventListener("pagehide", () => {
        win.cancelAnimationFrame(raf);
        pip = null;
        pipCanvas = null;
        setPopped(false);
        last = performance.now();
        raf = requestAnimationFrame(loop);
      });
    };

    return () => {
      (pip ?? window).cancelAnimationFrame(raf);
      window.clearTimeout(swap);
      pip?.close();
      unsubscribe();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("wheel", wheel);
      sound?.close();
      stage.dispose();
      reading.set({ playing: false, phase: "inhale", breaths: 0, seconds: 0, fill: 0, history: [] });
    };
  }, [broken]);

  return (
    <div ref={box} className="relative size-full bg-black [container-type:size]">
      <canvas ref={canvas} className="block size-full touch-none select-none" aria-label="Periphery: a breathing circle" />
      {/* the word in the black circle */}
      <span
        ref={word}
        aria-live="off"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[clamp(0.65rem,2.8cqmin,1.6rem)] text-white transition-opacity duration-[250ms]"
      >
        inhale
      </span>
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
            <p className="text-lg font-medium tracking-[-0.02em]">Periphery</p>
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

      {canPip && begun ? (
        <button
          type="button"
          onClick={() => void popOut.current()}
          disabled={popped}
          className="label absolute bottom-3 left-3 z-20 inline-flex min-h-9 cursor-pointer items-center rounded-full bg-white/80 px-4 !text-black backdrop-blur-sm transition-colors hover:bg-white disabled:opacity-50"
        >
          {popped ? "in the corner" : "keep it in a corner ↗"}
        </button>
      ) : null}
      {can ? <FullscreenButton full={full} onClick={toggle} /> : null}
    </div>
  );
}

/*
  The corner window: the same breath drawn simply, in 2D, so it costs next
  to nothing while you work. Background, the blue depth, the breath, the
  black centre and the word.
*/
function drawCorner(canvas: HTMLCanvasElement, piece: Piece, c: ReturnType<typeof controls.get>) {
  const win = canvas.ownerDocument.defaultView!;
  const dpr = Math.min(win.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const g = canvas.getContext("2d");
  if (!g) return;
  const unit = Math.min(w, h) / 2 / (MAX_R * 1.08);
  const css = (rgb: number[]) => `rgb(${rgb.map((v) => Math.round(v * 255)).join(",")})`;
  const amb = c.ambience >= 0 ? AMBIENCES[c.ambience] : null;
  const bg = amb ? amb.bg : [0.992, 0.807, 0.388];
  const breath = amb ? amb.colors[0] : bg;
  const disc = (r: number, color: string) => {
    g.beginPath();
    g.arc(w / 2, h / 2, Math.max(0, r * unit), 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  };
  g.fillStyle = css(bg);
  g.fillRect(0, 0, w, h);
  disc(piece.depth, "rgb(91,134,194)");
  disc(piece.r - 0.005, css(breath));
  disc(MIN_R * 0.6, "#000");
  g.fillStyle = "#fff";
  g.font = `${Math.round(Math.min(w, h) * 0.06)}px Inter, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(piece.phase, w / 2, h / 2);
}

const still = () => () => {};
const no = () => false;
let webgl2: boolean | undefined;
const noWebGL2 = () => {
  webgl2 ??= Boolean(document.createElement("canvas").getContext("webgl2"));
  return !webgl2;
};
