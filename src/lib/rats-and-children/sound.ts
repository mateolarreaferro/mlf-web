import type { Listen } from "./live";
import type { Being, WorldEvent } from "./world";

/*
  Rats & Children, the sound, in Web Audio. The same mix as the ChucK
  original: every being sings a loop (a random normal, small or tiny
  sample by its size), all loops share the level as 1/N, at most 40 at once;
  a bubble when one is born or dies, a random collision sound at most every
  half second, a sound when a disaster lands; and beds that come in as the
  population grows (day/night always, people at 5, meditation at 7, the beat
  at 10, the city at 15). New here: changes fade over a few milliseconds
  instead of clicking, a limiter sits on the output, and the panel can
  close a low-pass filter, set the volume, and listen to one colour only.

  The samples are MP3 (public/rats-and-children, converted from the
  original WAVs). MP3 pads the start and end of a file, which would put a
  hiccup in every loop, so manifest.json keeps each file's true length and
  `trim` cuts a decoded buffer back to it when the browser hasn't already.
  Samples load on demand, the first time something needs them.
*/

const BASE = "/rats-and-children/";
const LAME_DELAY = 1105; // samples LAME puts before the audio (576 + 529)
const MAX_VOICES = 40;
const FADE = 0.015;

type Manifest = Record<string, { frames: number; rate: number }>;

const BEDS: { name: string; gain: number; from: number }[] = [
  { name: "people", gain: 0.05, from: 5 },
  { name: "meditation", gain: 0.3, from: 7 },
  { name: "beat", gain: 0.5, from: 10 },
  { name: "city", gain: 0.06, from: 15 },
];

const pick = (n: number) => 1 + Math.floor(Math.random() * n);

type Voice = { source: AudioBufferSourceNode; gain: GainNode; red?: boolean };

export class Sound {
  readonly ctx: AudioContext;
  private out: GainNode;
  private filter: BiquadFilterNode;
  private listen: Listen = "all";
  private manifest: Promise<Manifest>;
  private cache = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Map<number, Voice>();
  private pending = new Set<number>();
  private beds = new Map<string, Voice>();
  private started = false;

  constructor() {
    this.ctx = new AudioContext();
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.9;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.5;
    this.out.connect(this.filter).connect(limiter).connect(this.ctx.destination);
    this.manifest = fetch(BASE + "manifest.json")
      .then((r) => r.json() as Promise<Manifest>)
      .catch(() => ({}));
  }

  /* the first press: browsers only let sound start from one */
  async start() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.started) return;
    this.started = true;
    this.bed("daynightcycle", 0.15);
  }

  suspend() {
    if (this.ctx.state === "running") void this.ctx.suspend();
  }

  resume() {
    if (this.started && this.ctx.state === "suspended") void this.ctx.resume();
  }

  close() {
    void this.ctx.close();
  }

  /* the panel's tone slider: 0..1, mapped to 180 Hz..20 kHz on a log scale */
  setTone(tone: number) {
    const hz = 180 * Math.pow(20000 / 180, Math.max(0, Math.min(1, tone)));
    this.filter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.05);
  }

  setVolume(volume: number) {
    this.out.gain.setTargetAtTime(0.9 * volume, this.ctx.currentTime, 0.05);
  }

  setListen(listen: Listen) {
    if (listen === this.listen) return;
    this.listen = listen;
    this.level();
  }

  /* what is sounding, for the panel */
  get state() {
    return {
      voices: [...this.voices.values()].filter((v) => this.audible(v)).length,
      layers: BEDS.filter((b) => this.beds.has(b.name)).map((b) => b.name),
    };
  }

  hear(e: WorldEvent, population: number) {
    if (!this.started) return;
    switch (e.type) {
      case "born":
        this.sing(e.being);
        this.once("bubble", 1);
        break;
      case "dying":
        this.once("bubble", 1);
        this.hush(e.being);
        break;
      case "gone":
        this.hush(e.being);
        break;
      case "collision":
        this.once(`collisions/${pick(15)}`, 0.25);
        break;
      case "disaster":
        this.once("ndCircle", 1);
        break;
    }
    this.population(population);
  }

  /* the beds follow the head count */
  population(n: number) {
    if (!this.started) return;
    for (const b of BEDS) {
      if (n >= b.from && !this.beds.has(b.name)) this.bed(b.name, b.gain);
      else if (n < b.from && this.beds.has(b.name)) {
        this.release(this.beds.get(b.name)!);
        this.beds.delete(b.name);
      }
    }
  }

  private load(name: string): Promise<AudioBuffer | null> {
    let p = this.cache.get(name);
    if (!p) {
      p = Promise.all([fetch(`${BASE}${name}.mp3`).then((r) => r.arrayBuffer()), this.manifest])
        .then(([data, manifest]) =>
          this.ctx.decodeAudioData(data).then((buf) => trim(this.ctx, buf, manifest[name])),
        )
        .catch(() => null);
      this.cache.set(name, p);
    }
    return p;
  }

  private play(buffer: AudioBuffer, gain: number, loop: boolean): Voice {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(gain, this.ctx.currentTime, FADE);
    source.connect(g).connect(this.out);
    source.start();
    return { source, gain: g };
  }

  private release(v: Voice) {
    const now = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setTargetAtTime(0, now, FADE);
    try {
      v.source.stop(now + FADE * 6);
    } catch {
      // a bed's placeholder whose sample never arrived was never started
    }
  }

  private once(name: string, gain: number) {
    void this.load(name).then((buf) => {
      if (buf) this.play(buf, gain, false);
    });
  }

  private bed(name: string, gain: number) {
    // hold the place at once, so a quick second crossing doesn't start two
    const holder = { source: this.ctx.createBufferSource(), gain: this.ctx.createGain() };
    this.beds.set(name, holder);
    void this.load(name).then((buf) => {
      if (!buf || this.beds.get(name) !== holder) return;
      this.beds.set(name, this.play(buf, gain, true));
    });
  }

  private sing(b: Being) {
    if (this.voices.size + this.pending.size >= MAX_VOICES) return;
    const name =
      b.category === 0 ? `normal/${pick(40)}` : b.category === 1 ? `small/${pick(7)}` : `tiny/${pick(8)}`;
    this.pending.add(b.id);
    void this.load(name).then((buf) => {
      // it may have died while the sample was on its way
      if (!this.pending.delete(b.id) || !buf) return;
      this.voices.set(b.id, { ...this.play(buf, 0, true), red: b.red });
      this.level();
    });
  }

  private hush(b: Being) {
    this.pending.delete(b.id);
    const v = this.voices.get(b.id);
    if (!v) return;
    this.voices.delete(b.id);
    this.release(v);
    this.level();
  }

  private audible(v: Voice) {
    return this.listen === "all" || (this.listen === "red") === v.red;
  }

  /* every loop you are listening to at 1/N, as in the original; the rest silent */
  private level() {
    const heard = [...this.voices.values()].filter((v) => this.audible(v));
    const now = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      v.gain.gain.setTargetAtTime(this.audible(v) ? 1 / heard.length : 0, now, 0.05);
    }
  }
}

/*
  Cut a decoded MP3 back to the original's length. If the browser already
  honoured the encoder's gapless header the lengths match and nothing
  happens; if not, the extra is LAME's delay at the front and padding at
  the end.
*/
function trim(
  ctx: AudioContext,
  buf: AudioBuffer,
  info: { frames: number; rate: number } | undefined,
): AudioBuffer {
  if (!info) return buf;
  const ratio = buf.sampleRate / info.rate;
  const want = Math.round(info.frames * ratio);
  if (buf.length <= want + 2) return buf;
  const skip = Math.min(Math.round(LAME_DELAY * ratio), buf.length - want);
  const out = ctx.createBuffer(buf.numberOfChannels, want, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.copyToChannel(buf.getChannelData(c).subarray(skip, skip + want), c);
  }
  return out;
}
