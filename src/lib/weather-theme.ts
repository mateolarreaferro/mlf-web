/*
  The background responds to the weather where the visitor is.

  The palette is one spectral ramp, warm at index 0 and cool at index 9. The
  mapping is a thermostat, not a thermometer: the page compensates for the
  weather rather than illustrating it. Freezing outside → the warm end. Hot
  outside → the cool end. Mild → the greens in the middle.

  Four signals, each doing one job:
    temperature  → where along the ramp the wash colours are sampled
    cloud cover  → how much colour there is at all (overcast reads as muted)
    daylight     → night pulls well toward the deep end, dims, and slows down
    wind speed   → how fast the two wash layers drift against each other

  Everything here is pure so the mapping can be reasoned about (and tested)
  without a DOM or a network call.
*/

export const RAMP = [
  "#f94144",
  "#f3722c",
  "#f8961e",
  "#f9844a",
  "#f9c74f",
  "#90be6d",
  "#43aa8b",
  "#4d908e",
  "#577590",
  "#277da1",
] as const;

export type Weather = {
  /** °C */
  temperature: number;
  /** 0–100 */
  cloudCover: number;
  /** km/h */
  windSpeed: number;
  isDay: boolean;
};

export type Atmosphere = {
  /** the three wash colours, warm-to-cool sampled around the temperature */
  colors: [string, string, string];
  /** carried through so the UI can show which half of the day this is */
  isDay: boolean;
  /** peak alpha of a wash layer */
  alpha: number;
  /** seconds per drift cycle for the two layers */
  driftA: number;
  driftB: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");

/*
  Sample the ramp at a continuous position 0..1, mixing the two neighbouring
  stops. Sampling between stops is what keeps 14°C and 15°C from looking like
  two different themes.
*/
export function sampleRamp(pos: number): string {
  const p = clamp(pos, 0, 1) * (RAMP.length - 1);
  const i = Math.floor(p);
  const j = Math.min(i + 1, RAMP.length - 1);
  const t = p - i;
  const a = hexToRgb(RAMP[i]);
  const b = hexToRgb(RAMP[j]);
  return `#${a.map((c, k) => toHex(c + (b[k] - c) * t)).join("")}`;
}

/* -5°C reads as "cold", 38°C as "hot"; everything between rides the ramp. */
const COLD_C = -5;
const HOT_C = 38;

export function atmosphereFor(w: Weather): Atmosphere {
  let pos = (w.temperature - COLD_C) / (HOT_C - COLD_C);

  /*
    Night is a real move, not a tint: it pulls a third of the way toward the
    deep end of the ramp, so even a hot night reads cool and a cold night trades
    its reds for ambers. Calm technology — the page should feel like the room
    it is being read in.
  */
  if (!w.isDay) pos = pos + (1 - pos) * 0.33;
  pos = clamp(pos, 0, 1);

  // a clear sky gets its full colour; overcast washes out toward neutral
  const clarity = 1 - clamp(w.cloudCover, 0, 100) / 100;
  let alpha = 0.13 + 0.11 * clarity;
  if (!w.isDay) alpha *= 0.68;

  // wind moves the air: calm is a slow 80s cycle, a gale is a brisk 26s one
  let driftA = clamp(80 - clamp(w.windSpeed, 0, 45) * 1.3, 26, 80);
  if (!w.isDay) driftA *= 1.25; // everything settles after dark

  return {
    isDay: w.isDay,
    // spread the three layers around the sampled point so the washes differ
    // from each other without ever jumping to the far end of the ramp
    colors: [sampleRamp(pos - 0.1), sampleRamp(pos + 0.06), sampleRamp(pos + 0.16)],
    alpha: Number(alpha.toFixed(3)),
    driftA: Math.round(driftA),
    driftB: Math.round(driftA * 1.31),
  };
}

/* What the page shows before (or without) any weather data: a mild spring day. */
export const DEFAULT_ATMOSPHERE = atmosphereFor({
  temperature: 18,
  cloudCover: 35,
  windSpeed: 8,
  isDay: true,
});
