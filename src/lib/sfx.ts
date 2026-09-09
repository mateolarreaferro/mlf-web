/*
  Soft synthesized UI tones, same voice as attractor.world's sound.js:
  a barely-there high sine on mouse hover (a finger can't hover), a warmer
  lower tone on press/Enter. No assets, one lazy AudioContext.

  Browsers keep the context suspended until a user gesture. press() runs
  inside one, so it can unlock; hover() never can, so it stays silent until
  the first press has opened the context rather than queueing stale tones.
*/

const HOVER_HZ = 880,
  HOVER_GAIN = 0.02,
  HOVER_DUR = 0.14;
const PRESS_HZ = 587,
  PRESS_GAIN = 0.035,
  PRESS_DUR = 0.22;
const TONE_ATTACK = 0.015; // no hard edges: eased in, exponential out

let ctx: AudioContext | null = null;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state !== "running") void ctx.resume(); // 'suspended' or iOS 'interrupted'
  return ctx;
}

function tone(freq: number, peak: number, dur: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + TONE_ATTACK);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function sfxHover() {
  const c = ensure();
  if (!c || c.state !== "running") return;
  tone(HOVER_HZ, HOVER_GAIN, HOVER_DUR);
}

export function sfxPress() {
  if (!ensure()) return;
  tone(PRESS_HZ, PRESS_GAIN, PRESS_DUR);
}
