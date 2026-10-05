"use client";

import { RED, YELLOW } from "@/lib/rats-and-children/world";
import { setSetting, useSettings, useStats, type Listen } from "@/lib/rats-and-children/live";

/*
  The left column's view into Rats & Children while its card is open (on a
  phone, under the description): what is alive and what has happened, what
  is sounding, and a few controls. The piece publishes, this reads and
  writes, through live.ts; nothing here touches the piece directly.
*/

const css = (c: number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;
const LISTEN: Listen[] = ["all", "red", "yellow"];
/* every control row on one grid and one height, so labels, controls and
   values line up down the column whatever the value says */
const ROW = "grid h-9 grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-4";
const hz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`);

function Slider({
  label,
  value,
  min,
  max,
  step,
  shown,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  shown: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className={ROW}>
      <span className="label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="h-1 w-full cursor-pointer accent-[var(--ink)]"
      />
      <span className="label whitespace-nowrap tabular-nums">{shown}</span>
    </label>
  );
}

function Line({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-8" />;
  const top = Math.max(4, ...values);
  const pts = values.map((v, i) => `${(i / 59) * 100},${30 - (v / top) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function RatsPanel() {
  const s = useStats();
  const set = useSettings();
  const alive = s.red + s.yellow;
  const day = s.sky > 0.66 ? "day" : s.sky < 0.33 ? "night" : "dusk";

  return (
    <div className="mt-8 space-y-6 text-sm">
      <section aria-label="What is happening">
        <p className="label mb-2">in the circle</p>
        {s.playing ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-2xl font-medium tabular-nums tracking-tight">{alive}</span>
              <span className="label">alive</span>
              <span className="label ml-auto tabular-nums">
                {s.normal} normal · {s.small} small · {s.tiny} tiny
              </span>
            </p>
            {/* the red and yellow share of the living */}
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-soft">
              <span style={{ width: `${alive ? (s.red / alive) * 100 : 0}%`, background: css(RED) }} />
              <span style={{ width: `${alive ? (s.yellow / alive) * 100 : 0}%`, background: css(YELLOW) }} />
            </div>
            <div className="mt-3">
              <Line values={s.history} />
            </div>
            <p className="label mt-2 tabular-nums">
              {s.born} born · {s.died} died · {s.collisions} touches · {s.disasters} disasters
            </p>
            <p className="label mt-1 tabular-nums">
              {day} · circle {Math.round(s.ring * 100)}% open · {s.voices} voices
              {s.layers.length ? ` · ${s.layers.join(", ")}` : ""}
            </p>
          </>
        ) : (
          <p className="label">Press begin on the piece; this follows what happens.</p>
        )}
      </section>

      <section aria-label="Controls">
        <div className={ROW}>
          <span className="label">hear</span>
          <div className="flex gap-1">
            {LISTEN.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={set.listen === l}
                onClick={() => setSetting("listen", l)}
                className={`label cursor-pointer rounded-full px-3 py-1 transition-colors ${
                  set.listen === l ? "bg-ink !text-paper" : "bg-soft hover:!text-ink"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="tone"
          value={set.tone}
          min={0}
          max={1}
          step={0.01}
          shown={set.tone > 0.98 ? "open" : hz(180 * Math.pow(20000 / 180, set.tone))}
          onChange={(v) => setSetting("tone", v)}
        />
        <Slider
          label="volume"
          value={set.volume}
          min={0}
          max={1}
          step={0.01}
          shown={`${Math.round(set.volume * 100)}%`}
          onChange={(v) => setSetting("volume", v)}
        />
        <Slider
          label="speed"
          value={set.speed}
          min={0.25}
          max={2}
          step={0.05}
          shown={`${set.speed.toFixed(2)}×`}
          onChange={(v) => setSetting("speed", v)}
        />
        <Slider
          label="disasters"
          value={set.disasters}
          min={0}
          max={2}
          step={0.1}
          shown={set.disasters === 0 ? "none" : `${set.disasters.toFixed(1)}×`}
          onChange={(v) => setSetting("disasters", v)}
        />
      </section>
    </div>
  );
}
