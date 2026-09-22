// A small, bounded world model. Weather is an input; currents, nutrients,
// plankton and light retain state and respond at different time scales.
export const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const TAU = Math.PI * 2;
const CACHE = "agents-boston-weather-v1";
export function validWeather(w, now = Date.now()) {
  return !!w && ["observedAt", "temperature", "cloud", "wind", "direction", "gust", "rain", "daylight"].every(k => typeof w[k] === "number" && Number.isFinite(w[k])) &&
    w.observedAt <= now + 900000 && now - w.observedAt < 6 * 3600000 && w.wind >= 0 && w.wind <= 250 && w.rain >= 0 && w.rain <= 200 && w.cloud >= 0 && w.cloud <= 100 && [0, 1].includes(w.daylight);
}
export function createEcosystem({ now = Date.now() } = {}) {
  // Time-based phases prevent every visit starting at the same animation pose.
  let seconds = now / 1000, weather = null, source = "simulation";
  const state = { energy: 0.5, turbulence: 0.4, nutrients: 0.55, plankton: 0.45, light: 0.4, currentX: 0.2, currentZ: 0.3, tide: 0.5, bloom: 0.5, metabolism: 0.7, phase: (seconds / 180) % TAU };
  function setWeather(w, origin = "live") {
    // A tab may have slept for hours. Validate against wall time, not the
    // paused animation clock, then catch its environmental clock up.
    if (!validWeather(w)) return false;
    seconds = Math.max(seconds, Date.now() / 1000);
    weather = { ...w }; source = origin; return true;
  }
  function update(dt) {
    if (!(dt > 0)) return state;
    // Stable even in accelerated tests. Rendering caps dt after a background tab.
    for (let left = Math.min(dt, 3600); left > 0;) {
      const h = Math.min(left, 1); left -= h; seconds += h;
      if (weather && seconds * 1000 - weather.observedAt >= 6 * 3600000) { weather = null; source = "simulation"; }
      else if (weather && seconds * 1000 - weather.observedAt > 2 * 3600000) source = "cached";
      const solar = 0.5 + 0.5 * Math.sin((seconds / 86400 - 0.46) * TAU); // fallback, not measured daylight
      const w = weather || { wind: 10 + 5 * Math.sin(seconds / 1900), gust: 16, direction: 210 + 45 * Math.sin(seconds / 3200), rain: 0, temperature: 15, cloud: 45, daylight: solar };
      const approach = (key, target, tau) => { state[key] += (target - state[key]) * (1 - Math.exp(-h / tau)); };
      const wind = clamp(w.wind / 45), rain = clamp(w.rain / 5), gust = clamp((w.gust - w.wind) / 35);
      state.tide = 0.5 + 0.5 * Math.sin(seconds * TAU / 44712); // modelled 12.42h tide, not a tide observation
      approach("energy", 0.26 + wind * 0.58 + rain * 0.16, 35);
      approach("turbulence", 0.2 + wind * 0.35 + gust * 0.25 + rain * 0.3, 24);
      approach("light", (0.16 + w.daylight * 0.84) * (1 - w.cloud * 0.006), 70);
      approach("nutrients", clamp(0.28 + state.energy * 0.45 + state.tide * 0.18 - state.plankton * 0.23), 110);
      approach("plankton", clamp(0.12 + state.nutrients * (0.65 + state.light * 0.4)), 180);
      const direction = (w.direction + 180) * Math.PI / 180;
      const pulse = 0.82 + 0.18 * Math.sin(seconds / 43) * Math.cos(seconds / 71);
      approach("currentX", Math.sin(direction) * state.energy * pulse, 45);
      approach("currentZ", -Math.cos(direction) * state.energy * pulse, 45);
      state.bloom = clamp(state.plankton * (1.15 - state.light * 0.4) + state.turbulence * 0.16);
      state.metabolism = 0.55 + clamp((w.temperature + 5) / 40) * 0.55;
      state.phase = (seconds / 180) % TAU;
    }
    return state;
  }
  return { state, setWeather, update, snapshot: () => ({ ...state, source, weather: weather && { ...weather }, time: seconds }) };
}

export function followBoston(model, onChange) {
  let pending = false, disposed = false;
  try { const w = JSON.parse(localStorage.getItem(CACHE)); if (validWeather(w)) model.setWeather(w, "cached"); } catch {}
  onChange(model.snapshot());
  async function refresh() {
    if (pending || disposed) return;
    pending = true;
    try {
      const response = await fetch("/api/agents-weather", { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Weather offline");
      const w = await response.json();
      if (disposed || !model.setWeather(w)) throw new Error("Weather invalid");
      try { localStorage.setItem(CACHE, JSON.stringify(w)); } catch {}
    } catch {
      const last = model.snapshot().weather;
      if (last) model.setWeather(last, "cached");
    } finally { pending = false; if (!disposed) onChange(model.snapshot()); }
  }
  const visible = () => { if (!document.hidden) void refresh(); };
  const interval = setInterval(visible, 15 * 60 * 1000);
  document.addEventListener("visibilitychange", visible);
  void refresh();
  return () => { disposed = true; clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
}
