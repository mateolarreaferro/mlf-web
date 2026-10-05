/*
  Rats & Children, the world. A port of Mateo's ChucK/ChuGL piece
  (RatsAndChildren.ck, Artful Design, Stanford, fall 2024) with the same
  rules and numbers; only the clock changed. The original stepped once per
  rendered frame, so anything it did "per frame" is scaled here by
  k = dt * 60, and the piece behaves the same at 60 or 120 Hz.

  What happens: a grey circle breathes inside a black one (a minute in,
  a minute out) while the sky goes from white to black and back over a
  minute. Pressing places a being, red or yellow, that wanders and sings
  its own loop. Beings that touch throw sparks; a red and a yellow of the
  normal size give birth to a small red one, and a small red touching a
  normal yellow gives a tiny one. A being that drifts outside the grey
  circle shrinks away, and every so often a black circle (the "natural
  disaster") falls somewhere and takes whatever it covers.

  This module only keeps the state and says what happened; drawing and
  sound listen to its events.
*/

export type RGB = [number, number, number];

export const RED: RGB = [1.0, 0.063, 0.122]; // "blue" in the original code
export const YELLOW: RGB = [0.965, 0.682, 0.176];
const CYAN: RGB = [0.0, 1.0, 1.0];
const ORANGE: RGB = [1.0, 0.5, 0.0];

export const BASE_R = 3 * 0.8; // the grey circle at its widest
const MIN_R = 0.3 * BASE_R;
export const FRAME_R = 1.02 * BASE_R; // the black circle behind it, fixed
const NORMAL_SIZE = 0.25 * 0.8;

const PARTICLE_POOL = 256;
const PARTICLE_R = 0.075;
const PARTICLE_LIFE = 2.0;

export type Category = 0 | 1 | 2; // normal, small, tiny

export type Being = {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  scale: number;
  red: boolean;
  category: Category;
  born: number;
  shrinking: boolean;
};

export type Particle = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  life: number;
  born: number;
  color: RGB;
};

export type Disaster = { x: number; y: number; size: number; born: number };

/* What the world tells the sound. */
export type WorldEvent =
  | { type: "born"; being: Being }
  | { type: "dying"; being: Being }
  | { type: "gone"; being: Being }
  | { type: "collision" }
  | { type: "disaster" };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class World {
  t = 0;
  ringR = MIN_R;
  sky = 0.5;
  beings: Being[] = [];
  particles: Particle[] = [];
  disaster: Disaster | null = null;
  disasterR = 0;

  private nextId = 1;
  private breath = 0;
  private lastSpawn = -Infinity;
  private lastBirth = -Infinity;
  private lastCollisionSound = -Infinity;
  private lastDisaster = 0;
  private disasterGap = rand(15, 40);

  constructor(private emit: (e: WorldEvent) => void) {}

  /* A press (or a held press, every 0.2 s) at a point in world units. */
  press(x: number, y: number) {
    if (this.t - this.lastSpawn < 0.2) return;
    this.lastSpawn = this.t;
    for (let i = 0; i < 5; i++) this.spark(x, y, RED, 0.6, 1.0);
    this.add(x, y, Math.random() < 0.5, NORMAL_SIZE, 0);
  }

  step(dt: number) {
    this.t += dt;
    const k = dt * 60;

    // the sky: white to black and back over a minute
    this.sky = (Math.sin(((2 * Math.PI) / 60) * this.t) + 1) / 2;
    // the grey circle breathes between its smallest and widest
    this.breath += 0.1 * dt;
    this.ringR = BASE_R - ((BASE_R - MIN_R) / 2) * (1 + Math.cos(this.breath));

    this.stepParticles(dt);
    this.stepBeings(dt, k);
    this.stepDisaster();
  }

  private add(x: number, y: number, red: boolean, scale: number, category: Category) {
    const being: Being = {
      id: this.nextId++,
      x,
      y,
      tx: x,
      ty: y,
      scale,
      red,
      category,
      born: this.t,
      shrinking: false,
    };
    this.beings.push(being);
    this.emit({ type: "born", being });
  }

  private spark(x: number, y: number, color: RGB, speed: number, life: number) {
    if (this.particles.length >= PARTICLE_POOL) return;
    const a = rand(0, 2 * Math.PI);
    this.particles.push({
      x,
      y,
      dx: Math.cos(a),
      dy: Math.sin(a),
      speed,
      life: PARTICLE_LIFE * life,
      born: this.t,
      color: [color[0] + rand(-0.05, 0.05), color[1] + rand(-0.05, 0.05), color[2] + rand(-0.05, 0.05)],
    });
  }

  /* how big a spark is drawn and what colour it has reached */
  sparkLook(p: Particle): { r: number; color: RGB } {
    const f = Math.min(1, (this.t - p.born) / p.life);
    const c = Math.pow(f, 0.5);
    return {
      r: PARTICLE_R * (1 - Math.pow(f, 0.2)),
      color: [p.color[0] + (RED[0] - p.color[0]) * c, p.color[1] + (RED[1] - p.color[1]) * c, p.color[2] + (RED[2] - p.color[2]) * c],
    };
  }

  /* how big a being is drawn: it eases in over half a second */
  beingR(b: Being): number {
    const age = this.t - b.born;
    if (age < 0.5 && !b.shrinking) return b.scale * easeInOutCubic(age / 0.5);
    return b.scale;
  }

  private stepParticles(dt: number) {
    this.particles = this.particles.filter((p) => this.t - p.born < p.life);
    for (const p of this.particles) {
      p.x += dt * p.dx * p.speed;
      p.y += dt * p.dy * p.speed;
    }
  }

  private stepBeings(dt: number, k: number) {
    const list = this.beings;
    // touching: sparks every frame they overlap (scaled to the clock)
    const burst = 10 * k;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > (a.scale + b.scale) * 1.1) continue;
        this.collide(a, b, burst);
      }
    }

    const glide = 1 - Math.pow(1 - easeInOutCubic(0.1) * 10, k);
    const wander = 0.01 * Math.sqrt(k);
    for (const b of list) {
      // the disaster takes whatever it covers
      if (this.disaster && !b.shrinking && Math.hypot(b.x - this.disaster.x, b.y - this.disaster.y) <= this.disasterR) {
        this.die(b);
      }
      if (!b.shrinking) {
        b.tx += rand(-wander, wander);
        b.ty += rand(-wander, wander);
      }
      b.x += glide * (b.tx - b.x);
      b.y += glide * (b.ty - b.y);
      // outside the grey circle nothing lives
      if (!b.shrinking && Math.hypot(b.x, b.y) > this.ringR) this.die(b);
      if (b.shrinking) b.scale -= dt * 0.5;
    }
    for (const b of list) if (b.shrinking && b.scale <= 0) this.emit({ type: "gone", being: b });
    this.beings = list.filter((b) => !(b.shrinking && b.scale <= 0));
  }

  private die(b: Being) {
    b.shrinking = true;
    this.emit({ type: "dying", being: b });
  }

  private collide(a: Being, b: Being, burst: number) {
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;

    // yellow wins a mixed meeting; same colours make orange or cyan
    const color = a.red !== b.red ? YELLOW : a.red ? CYAN : ORANGE;
    const life =
      a.category === 0 || b.category === 0 ? 2.0 : a.category === 1 || b.category === 1 ? 1.0 : 0.5;
    const speed =
      a.category === 2 && b.category === 2 ? 1.5 : a.category === 0 && b.category === 0 ? 0.6 : 1.0;

    const n = Math.floor(burst) + (Math.random() < burst % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) this.spark(x, y, color, speed, life);

    if (this.t - this.lastCollisionSound >= 0.5) {
      this.lastCollisionSound = this.t;
      this.emit({ type: "collision" });
    }

    if (this.t - this.lastBirth < 3) return;
    const mixed = a.red !== b.red;
    if (a.category === 0 && b.category === 0 && mixed && !a.shrinking && !b.shrinking) {
      // a red and a yellow of the normal size: a small red one
      this.lastBirth = this.t;
      this.add(x, y, true, a.scale * 0.6 * 0.8, 1);
      return;
    }
    const smallRed = (s: Being) => s.red && s.category === 1;
    const normalYellow = (s: Being) => !s.red && s.category === 0;
    if ((smallRed(a) && normalYellow(b)) || (smallRed(b) && normalYellow(a))) {
      // a small red meeting a normal yellow: a tiny red one
      this.lastBirth = this.t;
      const normal = a.category === 0 ? a : b;
      this.add(x, y, true, normal.scale * 0.4 * 0.8, 2);
    }
  }

  private stepDisaster() {
    if (!this.disaster && this.t - this.lastDisaster >= this.disasterGap) {
      this.lastDisaster = this.t;
      this.disasterGap = rand(10, 20);
      const size = this.ringR / 4 + rand(0, this.ringR / 4);
      const a = rand(0, 2 * Math.PI);
      const r = rand(0, this.ringR - size);
      this.disaster = { x: r * Math.cos(a), y: r * Math.sin(a), size, born: this.t };
      this.disasterR = size;
      this.emit({ type: "disaster" });
    }
    if (this.disaster) {
      const age = this.t - this.disaster.born;
      if (age >= 5) {
        this.disaster = null;
        this.disasterR = 0;
      } else {
        this.disasterR = Math.max(0, this.disaster.size * (1 - age / 5));
      }
    }
  }
}
