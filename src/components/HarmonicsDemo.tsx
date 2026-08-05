"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

/*
  An additive-synthesis toy that can live inside any thought:
  six partials, six sliders, one waveform, one drone.
*/
const PARTIALS = 6;

export default function HarmonicsDemo() {
  const [amps, setAmps] = useState<number[]>([1, 0.5, 0.33, 0, 0, 0]);
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);

  // draw one period of the summed waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const norm = Math.max(1, amps.reduce((a, b) => a + b, 0));
    ctx.strokeStyle =
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#c0705c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const phase = (x / w) * Math.PI * 2;
      let y = 0;
      for (let n = 0; n < PARTIALS; n++) y += amps[n] * Math.sin(phase * (n + 1));
      const py = h / 2 - (y / norm) * (h / 2 - 8);
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }, [amps]);

  // keep the oscillator's wavetable in sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const real = new Float32Array(PARTIALS + 1);
    const imag = new Float32Array(PARTIALS + 1);
    amps.forEach((a, n) => (imag[n + 1] = a));
    audio.osc.setPeriodicWave(audio.ctx.createPeriodicWave(real, imag, { disableNormalization: false }));
  }, [amps]);

  const toggle = () => {
    if (!audioRef.current) {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.frequency.value = 110;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      audioRef.current = { ctx, osc, gain };
      const real = new Float32Array(PARTIALS + 1);
      const imag = new Float32Array(PARTIALS + 1);
      amps.forEach((a, n) => (imag[n + 1] = a));
      osc.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    }
    const { ctx, gain } = audioRef.current;
    const next = !playing;
    setPlaying(next);
    if (next) {
      ctx.resume();
      gain.gain.setTargetAtTime(0.08, ctx.currentTime, 0.1);
    } else {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    }
  };

  useEffect(() => {
    return () => {
      audioRef.current?.ctx.close();
    };
  }, []);

  return (
    <figure className="my-10 rounded-3xl bg-soft p-6">
      <canvas ref={canvasRef} className="w-full h-28" aria-hidden="true" />
      <div className="mt-5 grid grid-cols-6 gap-3">
        {amps.map((a, i) => (
          <label key={i} className="flex flex-col items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={a}
              onChange={(e) => {
                const next = [...amps];
                next[i] = Number(e.target.value);
                setAmps(next);
              }}
              className="w-full accent-[var(--accent)]"
              aria-label={`Partial ${i + 1} amplitude`}
            />
            <span className="label">{i + 1}f</span>
          </label>
        ))}
      </div>
      <figcaption className="mt-4 flex items-baseline justify-between">
        <span className="label">additive synthesis — six partials on A2</span>
        <motion.button
          onClick={toggle}
          className="label hover:text-accent cursor-pointer rounded-full bg-paper px-4 py-1"
          aria-pressed={playing}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
        >
          {playing ? "stop" : "play"}
        </motion.button>
      </figcaption>
    </figure>
  );
}
