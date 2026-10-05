"use client";

import { useSyncExternalStore } from "react";
import { AMBIENCES, controls, MAX_R, MIN_R, reading, setControl } from "@/lib/periphery/periphery";

/*
  The left column's view into Periphery while its card is open (on a phone,
  under the description): where the breath is, how long one takes, how many
  so far, and the piece's controls (the same as its pads and wheel), shared
  through the stores in src/lib/periphery.
*/

const ROW = "grid h-9 grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-4";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`label cursor-pointer rounded-full px-3 py-1 transition-colors ${on ? "bg-ink !text-paper" : "bg-soft hover:!text-ink"}`}
    >
      {children}
    </button>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; shown: string; onChange: (v: number) => void }) {
  return (
    <label className={ROW}>
      <span className="label">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
        className="h-1 w-full cursor-pointer accent-[var(--ink)]"
      />
      <span className="label whitespace-nowrap tabular-nums">{props.shown}</span>
    </label>
  );
}

function Trace({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-8" />;
  const lo = Math.min(...values);
  const hi = Math.max(lo + 0.01, ...values);
  const pts = values.map((v, i) => `${(i / 199) * 100},${30 - ((v - lo) / (hi - lo)) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function PeripheryPanel() {
  const r = useSyncExternalStore(reading.subscribe, reading.get, reading.get);
  const c = useSyncExternalStore(controls.subscribe, controls.get, controls.get);
  const perMinute = r.seconds ? 60 / r.seconds : 0;

  return (
    <div className="mt-8 space-y-6 text-sm">
      <section aria-label="The breath">
        <p className="label mb-2">the breath</p>
        {r.playing ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-2xl font-medium tracking-tight">{r.phase}</span>
              <span className="label ml-auto tabular-nums">
                {r.breaths} breaths · {r.seconds.toFixed(1)} s each · {perMinute.toFixed(1)} a minute
              </span>
            </p>
            <div className="mt-3">
              <Trace values={r.history} />
            </div>
          </>
        ) : (
          <p className="label">Press begin on the piece; this follows your breath.</p>
        )}
      </section>

      <section aria-label="Controls">
        <div className={ROW}>
          <span className="label">ambience</span>
          <div className="col-span-2 flex flex-wrap gap-1">
            <Chip on={c.ambience === -1} onClick={() => setControl("ambience", -1)}>
              none
            </Chip>
            {AMBIENCES.map((a, i) => (
              <Chip key={a.name} on={c.ambience === i} onClick={() => setControl("ambience", c.ambience === i ? -1 : i)}>
                {a.name}
              </Chip>
            ))}
          </div>
        </div>
        <div className={ROW}>
          <span className="label">breath sounds</span>
          <div className="col-span-2 flex gap-1">
            {[0, 1].map((i) => (
              <Chip
                key={i}
                on={c.breathSounds[i]}
                onClick={() => {
                  const next: [boolean, boolean] = [...c.breathSounds];
                  next[i] = !next[i];
                  setControl("breathSounds", next);
                }}
              >
                {i === 0 ? "soft" : "deep"}
              </Chip>
            ))}
          </div>
        </div>
        <Slider
          label="depth"
          value={c.depth}
          min={MIN_R}
          max={MAX_R}
          step={0.01}
          shown={`${Math.round(((c.depth - MIN_R) / (MAX_R - MIN_R)) * 100)}%`}
          onChange={(v) => setControl("depth", v)}
        />
        <Slider label="pace" value={c.pace} min={0.5} max={2} step={0.05} shown={`${c.pace.toFixed(2)}×`} onChange={(v) => setControl("pace", v)} />
        <Slider
          label="volume"
          value={c.volume}
          min={0}
          max={1}
          step={0.01}
          shown={`${Math.round(c.volume * 100)}%`}
          onChange={(v) => setControl("volume", v)}
        />
      </section>
      <section aria-label="Keep it with you" className="space-y-2">
        <p className="label">
          &ldquo;Keep it in a corner&rdquo; on the piece floats the breath over everything else on your screen (Chrome
          and Edge on a computer). Or keep it in the corner of every page you browse with the extension:
        </p>
        <a
          href="/periphery/periphery-extension.zip"
          download
          className="label inline-flex min-h-9 items-center rounded-full bg-ink px-4 !text-paper"
        >
          download the extension ↓
        </a>
        <p className="label">
          Unzip it, open chrome://extensions, turn on Developer mode, and press &ldquo;Load unpacked&rdquo; on the
          folder. Chrome, Edge, Arc and Brave.
        </p>
      </section>
    </div>
  );
}
