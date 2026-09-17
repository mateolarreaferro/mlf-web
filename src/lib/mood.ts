/*
  The page has a mood: light or dark. Nobody should have to set it.

  Auto mode follows the day where the visitor is. Before the forecast lands we
  only have the local clock, so evening starts at 19:00 and morning at 07:00;
  once /api/weather answers, its `isDay` (real sunrise and sunset for that
  spot) takes over. A manual choice is honoured for twelve hours and then the
  page goes back to following the day, so a visitor who wanted dark once at
  noon is not still in the dark next week. Choosing the mood the day would
  have chosen anyway clears the override immediately: there is one button and
  it always means "the other one", with "auto" as what you fall back into.

  Pure functions first, then the thin DOM layer that uses them. The same rule
  is duplicated, minified, in the boot script in layout.tsx, which has to run
  before anything paints; keep the two in step.
*/

export type Mood = "light" | "dark";

export const STORAGE_KEY = "mlf-mood";
export const OVERRIDE_TTL_MS = 12 * 60 * 60 * 1000;
export const EVENING_HOUR = 19;
export const MORNING_HOUR = 7;

export type Override = { mood: Mood; at: number };

export function moodForClock(hour: number): Mood {
  return hour >= EVENING_HOUR || hour < MORNING_HOUR ? "dark" : "light";
}

export function moodForDaylight(isDay: boolean): Mood {
  return isDay ? "light" : "dark";
}

/* What auto mode gives right now: real daylight if known, the clock if not. */
export function autoMood(isDay: boolean | null, now: Date): Mood {
  return isDay === null ? moodForClock(now.getHours()) : moodForDaylight(isDay);
}

export function overrideIsLive(o: Override | null, now: number): o is Override {
  return o !== null && now - o.at >= 0 && now - o.at < OVERRIDE_TTL_MS;
}

export function resolveMood(o: Override | null, isDay: boolean | null, now: Date): Mood {
  return overrideIsLive(o, now.getTime()) ? o.mood : autoMood(isDay, now);
}

/*
  Pressing the button: go to the other mood. If that is what auto would have
  picked anyway, drop the override rather than storing a redundant one.
*/
export function nextOverride(current: Mood, isDay: boolean | null, now: Date): Override | null {
  const next: Mood = current === "dark" ? "light" : "dark";
  return next === autoMood(isDay, now) ? null : { mood: next, at: now.getTime() };
}

/* ---------- DOM layer (client only) ---------- */

let daylight: boolean | null = null;
type Listener = (m: Mood, fadeMs: number) => void;
const listeners = new Set<Listener>();

function readOverride(): Override | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Override>;
    if ((o.mood === "light" || o.mood === "dark") && typeof o.at === "number") {
      return { mood: o.mood, at: o.at };
    }
  } catch {
    /* private mode, blocked storage: behave as auto */
  }
  return null;
}

function writeOverride(o: Override | null) {
  try {
    if (o) localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* fine: the choice lasts for this page view */
  }
}

export function currentMood(): Mood {
  const attr = document.documentElement.dataset.mood;
  return attr === "dark" ? "dark" : "light";
}

export function isOverridden(): boolean {
  return overrideIsLive(readOverride(), Date.now());
}

/*
  Two speeds. A press is answered in FADE_MS: you asked, it happened. The day
  itself moves in DAWN_MS: when sunset reaches a page that is already open, or
  an override runs out, the room dims over a minute, which nobody sees happen
  and everybody finds right afterwards. The first forecast after load still
  takes the fast path, because a page that opens grey and stays grey for a
  minute reads as broken, not as evening.
*/
export const FADE_MS = 700; // must match --mood-fade in globals.css
export const DAWN_MS = 60_000;
let fadeTimer: ReturnType<typeof setTimeout> | undefined;
let gainTimer: ReturnType<typeof setInterval> | undefined;

/*
  The wash gain (how much coloured light the dark paper gets) is a CSS token
  and cannot be transitioned, so a slow fade carries it by hand: read the
  before and after values around the flip, then walk an inline value between
  them at ten steps a second and hand control back to the stylesheet at the
  end. Ten a second is plenty for a minute-long move, and it costs the
  browser only the two wash layers.
*/
function rampGain(from: number, ms: number) {
  const root = document.documentElement;
  root.style.removeProperty("--w-gain");
  const to = Number(getComputedStyle(root).getPropertyValue("--w-gain")) || 1;
  clearInterval(gainTimer);
  if (from === to) return;
  const start = performance.now();
  root.style.setProperty("--w-gain", String(from));
  gainTimer = setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / ms);
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    root.style.setProperty("--w-gain", (from + (to - from) * e).toFixed(3));
    if (t >= 1) {
      clearInterval(gainTimer);
      root.style.removeProperty("--w-gain");
    }
  }, 100);
}

function apply(m: Mood, fadeMs = FADE_MS) {
  if (currentMood() === m) return;
  const root = document.documentElement;
  const slow = fadeMs > FADE_MS;
  const gainBefore = Number(getComputedStyle(root).getPropertyValue("--w-gain")) || 1;
  /*
    While the page fades fast, elements with their own colour transition
    (links, buttons) must not restart theirs every frame or they trail the
    page by seconds. `data-mood-fade="fast"` lets globals.css switch those off
    for the ride; over a slow fade their 0.3s lag is invisible, so they keep
    it and hovers stay soft.
  */
  root.dataset.moodFade = slow ? "slow" : "fast";
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => delete root.dataset.moodFade, fadeMs + 50);
  root.dataset.mood = m;
  if (slow) rampGain(gainBefore, fadeMs);
  else {
    clearInterval(gainTimer);
    root.style.removeProperty("--w-gain");
  }
  for (const l of listeners) l(m, fadeMs);
}

/*
  Called whenever a forecast is in; only moves the page if it is in auto
  mode. The first one settles the page quickly; later ones (the page re-asks
  every quarter hour) are the sun actually going down, and take the dawn.
*/
export function setDaylight(isDay: boolean) {
  const first = daylight === null;
  daylight = isDay;
  apply(resolveMood(readOverride(), daylight, new Date()), first ? FADE_MS : DAWN_MS);
}

/*
  Once a minute, see whether the day has moved on: the clock crossing seven
  or nineteen when no forecast ever landed, or a twelve-hour override running
  out. Either way the page follows slowly. Idempotent; mounted once.
*/
let clock: ReturnType<typeof setInterval> | undefined;
export function followTheDay() {
  if (clock) return;
  clock = setInterval(() => {
    apply(resolveMood(readOverride(), daylight, new Date()), DAWN_MS);
  }, 60_000);
}

export function toggleMood() {
  const o = nextOverride(currentMood(), daylight, new Date());
  writeOverride(o);
  apply(resolveMood(o, daylight, new Date()));
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/*
  Runs before first paint (inlined in layout.tsx). Same rule as above with no
  daylight yet: a live override wins, else the clock.
*/
export const BOOT_SCRIPT = `(function(){try{var d="dark",l="light",m=null,r=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(r){var o=JSON.parse(r);var a=Date.now()-o.at;if((o.mood===d||o.mood===l)&&a>=0&&a<${OVERRIDE_TTL_MS})m=o.mood}if(!m){var h=new Date().getHours();m=(h>=${EVENING_HOUR}||h<${MORNING_HOUR})?d:l}document.documentElement.dataset.mood=m}catch(e){}})()`;
