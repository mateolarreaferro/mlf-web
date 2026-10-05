import { Stage, store, type RGB } from "@/lib/pieces/gl";

/*
  SacredVis, an audio visualizer: Mateo's ChucK/ChuGL final project for
  Music 256A / CS 476 (SoundAndVision.ck, Stanford, fall 2024) ported to
  WebGL2 and Web Audio with its own numbers. Sound becomes a spiral
  spectrogram: one point per frequency band from 20 Hz to 10 kHz, each a
  little further out than the last, the angle between neighbours drifting
  with the loudness (towards 10 radians and beyond, which is what makes the
  star shapes), coloured blue to red by frequency where there is energy.
  A white waveform runs across the middle, and sparks orbit out from the
  loudest band. What goes in comes back out through a half-second echo and
  a reverb.

  The original listened to the computer's input. Here the visitor chooses:
  the microphone (not played back unless they ask for it, since speakers
  would feed it back) or a recording from Rats & Children.
*/

// the original's analysis: a 700-sample window in a 1400-point FFT at 44.1 kHz
const ORIGINAL_RATE = 44100;
const ORIGINAL_FFT = 1400;
const BIN_HZ = ORIGINAL_RATE / ORIGINAL_FFT;
const MIN_BIN = Math.floor((20 / ORIGINAL_RATE) * ORIGINAL_FFT);
const MAX_BIN = Math.floor((10000 / ORIGINAL_RATE) * ORIGINAL_FFT);
export const BANDS = MAX_BIN - MIN_BIN;
const WINDOW = 700;

// a perspective camera at z = 90 with a 45 degree field shows this much at z = 0
export const VIEW_R = 90 * Math.tan((22.5 * Math.PI) / 180);

const SPECTRUM: RGB[] = [
  [0, 0, 1],
  [0, 1, 1],
  [0, 1, 0],
  [1, 1, 0],
  [1, 0.5, 0],
  [1, 0, 0],
];
const SKYBLUE: RGB = [0.529, 0.808, 0.922];
const RED: RGB = [1, 0, 0];
const PARTICLE_LIFE = 0.75;
/*
  The browser's analyser normalises its magnitudes (a full-scale sine reads
  about 0.5) and ChucK's FFT does not (with this 700-sample Hann window, a
  sine of amplitude A reads about 175 A), so the browser's values are scaled
  by 350, then by the original's own 15, before any of its thresholds and
  multipliers apply. Too small a scale leaves every band under the colour
  threshold and the spiral draws white.
*/
const TO_CHUCK = 15 * 350;

export type Source = "microphone" | "recording";

export type Controls = {
  source: Source;
  listenBack: boolean; // play the microphone back (with headphones)
  sensitivity: number; // 0.25..4
  echo: number; // 0..0.9, the delayed copy's level (0.7 as composed)
  reverb: number; // 0..1, the reverb's mix (0.25 as composed)
  spin: number; // 0..3, how fast the spiral turns (1 as composed)
};
export type Reading = {
  playing: boolean;
  source: Source | null;
  level: number; // the overall magnitude the piece reacts to
  peakHz: number;
  step: number; // radians between neighbouring bands
  sparks: number;
  denied: boolean; // the microphone was refused
};

export const controls = store<Controls>({ source: "recording", listenBack: false, sensitivity: 1, echo: 0.7, reverb: 0.25, spin: 1 });
export const reading = store<Reading>({ playing: false, source: null, level: 0, peakHz: 0, step: 0, sparks: 0, denied: false });

export function setControl<K extends keyof Controls>(key: K, value: Controls[K]) {
  controls.set({ ...controls.get(), [key]: value });
}

type Spark = { angle: number; radius: number; born: number; color: RGB };

const smooth = (prev: number, next: number, f: number) => prev + (next - prev) * f;
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class SacredVis {
  t = 0;
  level = 0;
  peakHz = 0;
  angleStep = 0.001; // previous_angle_increment
  private magnitudes = new Float32Array(BANDS);
  private radius = new Float32Array(BANDS);
  private wave = new Float32Array(WINDOW);
  private baseRadius = 2;
  private rotation = 0.001;
  private sparks: Spark[] = [];
  private spec: Float32Array<ArrayBuffer>;
  private time: Float32Array<ArrayBuffer>;
  private points = new Float32Array(BANDS * 2);
  private colors = new Float32Array(BANDS * 4);
  private wavePoints = new Float32Array(WINDOW * 2);

  constructor(private analyser: AnalyserNode) {
    this.spec = new Float32Array(analyser.frequencyBinCount);
    this.time = new Float32Array(analyser.fftSize);
  }

  get sparkCount() {
    return this.sparks.length;
  }

  step(dt: number, c: Controls) {
    this.t += dt;
    const a = this.analyser;
    a.getFloatFrequencyData(this.spec);
    a.getFloatTimeDomainData(this.time);

    // the browser's spectrum, read at the original's bands
    const hzPerBin = a.context.sampleRate / a.fftSize;
    let total = 0;
    let peak = 0;
    for (let k = 0; k < BANDS; k++) {
      const f = (k + MIN_BIN) * BIN_HZ;
      const x = f / hzPerBin;
      const i = Math.floor(x);
      const db = this.spec[i] + (this.spec[Math.min(i + 1, this.spec.length - 1)] - this.spec[i]) * (x - i);
      const m = TO_CHUCK * c.sensitivity * Math.pow(10, (Number.isFinite(db) ? db : -200) / 20);
      this.magnitudes[k] = m;
      total += m;
      if (m > this.magnitudes[peak]) peak = k;
    }
    this.level = Math.sqrt(total / BANDS);
    this.peakHz = (peak + MIN_BIN) * BIN_HZ;

    // the spiral: the angle drifts with the loudness, the radius breathes
    if (this.level > 0.001) this.angleStep = smooth(this.angleStep, 10 + 0.1 * this.level, 0.01 * dt * 60);
    this.baseRadius = smooth(this.baseRadius, 2 + 0.2 * Math.cos(this.t * 0.5 * Math.PI), 0.5);
    const scale = 0.3 * Math.cos(this.t * ((2 * Math.PI) / 30)) + 0.4;
    this.rotation += dt * 0.2 * c.spin;
    const turn = Math.PI * this.rotation;
    for (let k = 0; k < BANDS; k++) {
      const target = 5 + this.baseRadius + scale * (k + 1) + this.magnitudes[k] * 0.05;
      this.radius[k] = smooth(target, this.radius[k], 0.5);
      const ang = k * this.angleStep;
      this.points[k * 2] = this.radius[k] * Math.sin(ang + turn);
      this.points[k * 2 + 1] = this.radius[k] * Math.cos(ang + turn);
      let col: RGB = [1, 1, 1];
      if (this.magnitudes[k] > 0.001) {
        const f = (k / BANDS) * (SPECTRUM.length - 1);
        let idx = Math.floor(f);
        let t = f % 1;
        if (idx >= SPECTRUM.length - 1) {
          idx = SPECTRUM.length - 2;
          t = 1;
        }
        col = lerp3(SPECTRUM[idx], SPECTRUM[idx + 1], t);
      }
      this.colors.set([col[0], col[1], col[2], 1], k * 4);
    }

    // the waveform: the last 700 samples across the middle
    const offset = (WINDOW / 2) * 0.2;
    const from = this.time.length - WINDOW;
    for (let i = 0; i < WINDOW; i++) {
      this.wavePoints[i * 2] = i * 0.2 - offset;
      this.wavePoints[i * 2 + 1] = smooth(this.wavePoints[i * 2 + 1], this.time[from + i] * 0.5 * c.sensitivity, 0.5);
    }

    // sparks from the loudest band, when it is loud enough
    if (this.level > 0.15) {
      this.sparks.push({ angle: 0, radius: this.radius[peak], born: this.t, color: SPECTRUM[peak % SPECTRUM.length] });
      if (this.sparks.length > 300) this.sparks.shift();
    }
    this.sparks = this.sparks.filter((s) => this.t - s.born < PARTICLE_LIFE);
    for (const s of this.sparks) s.angle += (4 * Math.PI * dt) / PARTICLE_LIFE;
  }

  draw(stage: Stage) {
    // the spiral's width follows the loudness, never thinner than a pixel
    const width = (0.03 * Math.cos(this.t * ((2 * Math.PI) / 40)) + 0.04) * this.level;
    const px = 1 / stage.ppu;
    stage.line(this.wavePoints, null, Math.max(0.5, px), [1, 1, 1], 0.9);
    stage.line(this.points, this.colors, Math.max(width, px));
    for (const s of this.sparks) {
      const f = (this.t - s.born) / PARTICLE_LIFE;
      const col = lerp3(s.color, lerp3(SKYBLUE, RED, f), f);
      stage.disc(s.radius * Math.cos(s.angle), s.radius * Math.sin(s.angle), 1 - f, col);
    }
    stage.render([0, 0, 0], { threshold: 0.35, intensity: 0.9 });
  }
}

/*
  The sound: the source into the analysis, and out through the original's
  chain (dry, a 0.5 s echo at 0.7, a reverb on the echo). The microphone's
  way out is closed unless the visitor turns "listen back" on.
*/
export class SacredSound {
  readonly ctx = new AudioContext();
  readonly analyser = this.ctx.createAnalyser();
  private input = this.ctx.createGain();
  private monitor = this.ctx.createGain();
  private delay = this.ctx.createDelay(1);
  private delayGain = this.ctx.createGain();
  private wet = this.ctx.createGain();
  private source: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private kind: Source | null = null;

  constructor() {
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    this.input.connect(this.analyser);
    this.input.connect(this.monitor);
    this.monitor.connect(this.ctx.destination);
    this.monitor.connect(this.delay);
    this.delay.delayTime.value = 0.5;
    this.delay.connect(this.delayGain).connect(this.ctx.destination);
    const reverb = this.ctx.createConvolver();
    reverb.buffer = impulse(this.ctx, 2.2);
    this.delayGain.connect(reverb).connect(this.wet).connect(this.ctx.destination);
  }

  /* resolves false if the microphone was refused */
  async use(kind: Source): Promise<boolean> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (kind === this.kind) return true;
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source = null;
    this.stream = null;
    this.kind = kind;
    if (kind === "microphone") {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch {
        this.kind = null;
        return false;
      }
      const s = this.ctx.createMediaStreamSource(this.stream);
      s.connect(this.input);
      this.source = s;
      return true;
    }
    const data = await fetch("/rats-and-children/meditation.mp3").then((r) => r.arrayBuffer());
    const buf = await this.ctx.decodeAudioData(data);
    if (this.kind !== "recording") return true;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(this.input);
    s.start();
    this.source = s;
    return true;
  }

  apply(c: Controls) {
    const now = this.ctx.currentTime;
    // the recording is meant to be heard; the microphone only on request
    const open = this.kind === "recording" || (this.kind === "microphone" && c.listenBack);
    this.monitor.gain.setTargetAtTime(open ? 1 : 0, now, 0.05);
    this.delayGain.gain.setTargetAtTime(c.echo, now, 0.05);
    this.wet.gain.setTargetAtTime(c.reverb * 3.2, now, 0.05);
  }

  close() {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx.close();
  }
}

/* a plain decaying-noise room for the reverb (the original used JCRev) */
function impulse(ctx: BaseAudioContext, seconds: number) {
  const n = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  }
  return buf;
}
