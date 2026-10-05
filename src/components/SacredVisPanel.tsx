"use client";

import { useSyncExternalStore } from "react";
import { controls, reading, setControl, type Source } from "@/lib/sacredvis/sacredvis";

/*
  The left column's view into SacredVis while its card is open (on a phone,
  under the description): how loud, where the energy is, how folded the
  spiral is, and the controls, shared through the stores in
  src/lib/sacredvis.
*/

const ROW = "grid h-9 grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-4";
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const note = (hz: number) => {
  if (hz <= 0) return "";
  const m = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${NOTES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
};

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

export default function SacredVisPanel() {
  const r = useSyncExternalStore(reading.subscribe, reading.get, reading.get);
  const c = useSyncExternalStore(controls.subscribe, controls.get, controls.get);
  const SOURCES: Source[] = ["microphone", "recording"];

  return (
    <div className="mt-8 space-y-6 text-sm">
      <section aria-label="The sound">
        <p className="label mb-2">listening</p>
        {r.playing ? (
          <>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-soft" aria-hidden>
              <span className="bg-ink transition-[width] duration-150" style={{ width: `${Math.min(100, r.level * 60)}%` }} />
            </div>
            <p className="label mt-3 tabular-nums">
              loudest at {Math.round(r.peakHz)} Hz ({note(r.peakHz)}) · step {r.step.toFixed(2)} rad · {r.sparks} sparks
            </p>
          </>
        ) : (
          <p className="label">Choose the microphone or the recording on the piece; this follows the sound.</p>
        )}
      </section>

      <section aria-label="Controls">
        <div className={ROW}>
          <span className="label">source</span>
          <div className="col-span-2 flex gap-1">
            {SOURCES.map((s) => (
              <Chip key={s} on={r.playing && c.source === s} onClick={() => setControl("source", s)}>
                {s}
              </Chip>
            ))}
          </div>
        </div>
        <div className={ROW}>
          <span className="label">listen back</span>
          <div className="col-span-2 flex items-center gap-2">
            <Chip on={c.listenBack} onClick={() => setControl("listenBack", !c.listenBack)}>
              {c.listenBack ? "on" : "off"}
            </Chip>
            <span className="label">the microphone, with headphones</span>
          </div>
        </div>
        <Slider
          label="sensitivity"
          value={c.sensitivity}
          min={0.25}
          max={4}
          step={0.05}
          shown={`${c.sensitivity.toFixed(2)}×`}
          onChange={(v) => setControl("sensitivity", v)}
        />
        <Slider label="echo" value={c.echo} min={0} max={0.9} step={0.01} shown={`${Math.round(c.echo * 100)}%`} onChange={(v) => setControl("echo", v)} />
        <Slider label="reverb" value={c.reverb} min={0} max={1} step={0.01} shown={`${Math.round(c.reverb * 100)}%`} onChange={(v) => setControl("reverb", v)} />
        <Slider label="spin" value={c.spin} min={0} max={3} step={0.05} shown={`${c.spin.toFixed(2)}×`} onChange={(v) => setControl("spin", v)} />
      </section>
      {r.denied ? <p className="label">The microphone was not allowed; the recording still works.</p> : null}
    </div>
  );
}
