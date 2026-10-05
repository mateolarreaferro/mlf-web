import { Stage, store, type RGB } from "@/lib/pieces/gl";

/*
  Periphery, a breathing interface to prevent screen apnea: Mateo's ChucK/
  ChuGL piece (Periphery.ck, Artful Design, Stanford, fall 2024) ported to
  WebGL2 and Web Audio with its own numbers. A circle breathes inside a blue
  one whose size is the depth of the breath (the scroll wheel, or the
  panel's slider); the edge moves at a constant 0.25 units a second, so a
  deeper breath is a slower one. Pads at the left: four ambiences (noise,
  café, forest, drone) that recolour the scene, grow five soft circles and
  fade in a loop, and two that add an inhale and exhale sound at each turn.

  This file is the whole piece but the component: state, step, drawing and
  sound. The page shows "inhale" / "exhale" itself, as text over the canvas.
*/

const BASE = 3 * 0.8;
export const MIN_R = BASE * 0.3; // the smallest breath, and the depth's floor
export const MAX_R = 3 * MIN_R; // the depth's ceiling
export const TEXT_R = MIN_R * 0.6; // the black circle behind the word
export const VIEW_R = 3.3; // ChuGL's default orthographic view, half height

const DEFAULT_BG: RGB = [0.992, 0.807, 0.388];
const DEFAULT_COLORS: RGB[] = [
  [0.976, 0.643, 0.376],
  [0.992, 0.807, 0.388],
  [0.357, 0.525, 0.761],
];
const LIMIT_BLUE: RGB = [0.357, 0.525, 0.761];

export const AMBIENCES = [
  { name: "noise", file: "Noise_Ambience", gain: 0.6, bg: [0.2, 0.2, 0.2] as RGB, colors: DEFAULT_COLORS },
  {
    name: "café",
    file: "Cafe_Ambience",
    gain: 0.2,
    bg: [0.545, 0.27, 0.074] as RGB,
    colors: [[0.8, 0.5, 0.2], [0.9, 0.7, 0.4], [0.7, 0.4, 0.1]] as RGB[],
  },
  {
    name: "forest",
    file: "Forrest_Ambience",
    gain: 0.3,
    bg: [0.2, 0.4, 0.2] as RGB,
    colors: [[0.3, 0.6, 0.3], [0.4, 0.7, 0.4], [0.2, 0.5, 0.2]] as RGB[],
  },
  {
    name: "drone",
    file: "Drone_Ambience",
    gain: 1.0,
    bg: [0.1, 0.1, 0.3] as RGB,
    colors: [[0.2, 0.2, 0.5], [0.3, 0.3, 0.6], [0.4, 0.4, 0.7]] as RGB[],
  },
];

/* the panel's view and controls, shared with the piece */
export type Controls = {
  depth: number; // MIN_R..MAX_R
  ambience: number; // -1 none, 0..3
  breathSounds: [boolean, boolean];
  pace: number; // 0.5..2, multiplies the edge's speed
  volume: number; // 0..1
};
export type Reading = {
  playing: boolean;
  phase: "inhale" | "exhale";
  breaths: number;
  seconds: number; // how long one full breath takes at this depth and pace
  fill: number; // 0..1, where the breath is between empty and full
  history: number[]; // the breath's size, ten samples a second, the last 20 s
};

/*
  It starts at about six breaths a minute (10 s each), a calm pace. The
  original started at its shallowest depth, a 3.6 s breath, which flips
  "inhale" and "exhale" every 1.8 s and reads as frantic, not as breathing.
*/
const CALM_DEPTH = TEXT_R + 2 * ((10 * 0.25) / (2 * Math.PI));
export const controls = store<Controls>({ depth: CALM_DEPTH, ambience: -1, breathSounds: [false, false], pace: 1, volume: 0.8 });
export const reading = store<Reading>({ playing: false, phase: "inhale", breaths: 0, seconds: 0, fill: 0, history: [] });

export function setControl<K extends keyof Controls>(key: K, value: Controls[K]) {
  controls.set({ ...controls.get(), [key]: value });
}

/* how long a full breath takes: down and up the amplitude at the edge's speed */
export function breathSeconds(depth: number, pace: number) {
  const amplitude = Math.max(0.0001, (depth - TEXT_R) / 2);
  return (2 * Math.PI * amplitude) / (0.25 * pace);
}

type Blob = { x: number; y: number; target: number; r: number; speed: number; color: RGB; shrinking: boolean };

export class Periphery {
  t = 0;
  r = 0; // the breathing circle
  depth = controls.get().depth; // eased towards the control, so a scroll never jumps
  phase: "inhale" | "exhale" = "inhale";
  breaths = 0;
  hovered = -1;
  private angle = 0;
  private rising = true;
  private blobs: Blob[] = [];
  private colors: RGB[] = DEFAULT_COLORS;
  private bg: RGB = DEFAULT_BG;
  private breathColor: RGB = DEFAULT_BG;

  constructor(private onTurn: (phase: "inhale" | "exhale") => void) {}

  /* the pads, in world units, for the current view: ambiences bottom up, then the breath pads */
  pads(stage: Stage) {
    const [ex, ey] = stage.extent;
    const spacing = (2 * ey) / 4;
    const bottom = -ey + spacing / 2;
    const gap = spacing * 0.4;
    const half = (spacing * 0.3) / 2;
    const x = -ex + spacing * 0.4;
    const out: { x: number; y: number; half: number; kind: "ambience" | "breath"; i: number }[] = [];
    for (let i = 0; i < 4; i++) out.push({ x, y: bottom + i * gap, half, kind: "ambience", i });
    for (let i = 0; i < 2; i++) out.push({ x, y: bottom + (4 + i) * gap + gap * 2, half, kind: "breath", i });
    return out;
  }

  /* an ambience pad pressed: the only one, or none if it was already on */
  setAmbience(i: number) {
    for (const b of this.blobs) b.shrinking = true;
    if (i < 0) {
      this.colors = DEFAULT_COLORS;
      this.bg = DEFAULT_BG;
      this.breathColor = DEFAULT_BG;
      return;
    }
    const a = AMBIENCES[i];
    this.colors = a.colors;
    this.bg = a.bg;
    this.breathColor = a.colors[0];
    for (let k = 0; k < 5; k++) {
      this.blobs.push({
        x: rand(-5, 5),
        y: rand(-5, 5),
        target: rand(0.5, 1.5),
        r: 0,
        speed: rand(0.02, 0.1),
        color: this.colors[Math.floor(Math.random() * 3)],
        shrinking: false,
      });
    }
  }

  step(dt: number, c: Controls) {
    this.t += dt;
    const k = dt * 60;
    // the depth glides to where it was set (about a third of a second), and
    // the breath keeps its place in the cycle, so nothing jumps
    this.depth += (c.depth - this.depth) * (1 - Math.exp(-dt * 6));
    const amplitude = Math.max(0.0001, (this.depth - TEXT_R) / 2);
    this.angle += ((0.25 * c.pace) / amplitude) * dt;
    this.r = this.depth - amplitude * (1 + Math.cos(this.angle));
    // in or out from where the breath is in its cycle (r rises while sin > 0),
    // not from r itself: a change of depth moves r and must not count a breath
    const rising = Math.sin(this.angle) >= 0;
    if (rising !== this.rising) {
      this.rising = rising;
      this.phase = rising ? "inhale" : "exhale";
      if (rising) this.breaths++;
      this.onTurn(this.phase);
    }

    // the ambience circles grow towards their size and shrink away when let go
    for (const b of this.blobs) {
      if (b.shrinking) b.r -= 0.05 * b.target * k;
      else b.r += (1 - Math.pow(1 - b.speed, k)) * (b.target - b.r);
    }
    this.blobs = this.blobs.filter((b) => !b.shrinking || b.r > 0);
  }

  draw(stage: Stage, c: Controls) {
    for (const b of this.blobs) stage.disc(b.x, b.y, b.r, b.color);
    stage.disc(0, 0, this.depth, LIMIT_BLUE);
    stage.disc(0, 0, Math.max(0, this.r - 0.005), this.breathColor);
    stage.disc(0, 0, TEXT_R, [0, 0, 0]);
    for (const p of this.pads(stage)) {
      const on = p.kind === "ambience" ? c.ambience === p.i : c.breathSounds[p.i];
      const id = p.kind === "ambience" ? p.i : 100 + p.i;
      const color: RGB = on ? [1, 1, 1] : this.hovered === id ? [1, 0.65, 0] : [0, 0, 0];
      stage.rect(p.x, p.y, p.half, p.half, color);
    }
    stage.render(this.bg, { threshold: 0.5, intensity: 0.25 });
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/*
  The sound: one ambience loop at a time, faded in and out over 1.5 s as in
  the original, and the four short breath samples. The original raised the
  first ambience to full volume and later ones to 0.6 / 0.2 / 0.3 / 1.0;
  the later, balanced levels are used every time.
*/
const DIR = "/periphery/";

export class PeripherySound {
  readonly ctx = new AudioContext();
  private out = this.ctx.createGain();
  private cache = new Map<string, Promise<AudioBuffer | null>>();
  private loop: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private want = -1;

  constructor() {
    this.out.connect(this.ctx.destination);
  }

  async start() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setVolume(v: number) {
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  ambience(i: number) {
    if (i === this.want) return;
    this.want = i;
    const now = this.ctx.currentTime;
    if (this.loop) {
      const old = this.loop;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + 1.5);
      old.source.stop(now + 1.6);
      this.loop = null;
    }
    if (i < 0) return;
    const a = AMBIENCES[i];
    void this.load(a.file).then((buf) => {
      if (!buf || this.want !== i) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buf;
      source.loop = true;
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(a.gain, t + 1.5);
      source.connect(gain).connect(this.out);
      source.start();
      this.loop = { source, gain };
    });
  }

  /* the breath pads: pad 0 is sample / sample2, pad 1 is sample3 / sample4 */
  breath(pad: number, phase: "inhale" | "exhale") {
    const file = pad === 0 ? (phase === "inhale" ? "sample" : "sample2") : phase === "inhale" ? "sample3" : "sample4";
    void this.load(file).then((buf) => {
      if (!buf) return;
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      s.connect(this.out);
      s.start();
    });
  }

  close() {
    void this.ctx.close();
  }

  private load(name: string) {
    let p = this.cache.get(name);
    if (!p) {
      p = fetch(`${DIR}${name}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((d) => this.ctx.decodeAudioData(d))
        .catch(() => null);
      this.cache.set(name, p);
    }
    return p;
  }
}
