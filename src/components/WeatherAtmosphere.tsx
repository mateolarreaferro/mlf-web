"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { FaRegMoon, FaRegSun } from "react-icons/fa6";
import type { Atmosphere } from "@/lib/weather-theme";

const FADE_MS = 700; // must match the opacity transition in globals.css

type WeatherResponse = {
  ok: boolean;
  city?: string | null;
  weather?: { temperature: number };
  atmosphere?: Atmosphere;
};

/*
  Fetches the visitor's current conditions once, hands the colours to CSS as
  custom properties (globals.css owns what they look like), and states plainly
  in the header where the colours came from.

  The swap happens behind a fade: the washes drop to opacity 0, the colours
  change while they are invisible, and they come back up. Custom properties
  can't be transitioned reliably (see the note in globals.css), so the motion
  lives on opacity instead — the page takes one slow breath when the weather
  arrives rather than flickering to a new colour.
*/

export default function WeatherAtmosphere() {
  const [shown, setShown] = useState<{
    city: string;
    temperature: number;
    isDay: boolean;
    colors: [string, string, string];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const apply = (a: Atmosphere) => {
      const root = document.documentElement;
      root.style.setProperty("--w1", a.colors[0]);
      root.style.setProperty("--w2", a.colors[1]);
      root.style.setProperty("--w3", a.colors[2]);
      root.style.setProperty("--w-alpha", String(a.alpha));
      root.style.setProperty("--w-drift-a", `${a.driftA}s`);
      root.style.setProperty("--w-drift-b", `${a.driftB}s`);
    };

    (async () => {
      try {
        const res = await fetch("/api/weather");
        const data = (await res.json()) as WeatherResponse;
        if (cancelled || !data.ok || !data.atmosphere || !data.weather) return;

        const atmosphere = data.atmosphere;
        const reveal = () => {
          if (cancelled) return;
          apply(atmosphere);
          // only name a place we actually have one for
          if (data.city) {
            setShown({
              city: data.city,
              temperature: data.weather!.temperature,
              isDay: atmosphere.isDay,
              colors: atmosphere.colors,
            });
          }
        };

        const root = document.documentElement;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          reveal();
          return;
        }

        root.dataset.wash = "hold";
        timer = setTimeout(() => {
          reveal();
          delete root.dataset.wash;
        }, FADE_MS);
      } catch {
        // decoration: a failure here should be invisible
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!shown) return null;

  return (
    <motion.p
      className="label hidden items-center gap-2 sm:flex"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      title={`the background colour follows the weather where you are — ${
        shown.isDay ? "daytime" : "after dark"
      }`}
    >
      {shown.isDay ? (
        <FaRegSun className="size-3 shrink-0" aria-hidden />
      ) : (
        <FaRegMoon className="size-3 shrink-0" aria-hidden />
      )}
      <span>
        {shown.city.toLowerCase()} · {Math.round(shown.temperature)}°c
      </span>
      {/* most-used colour first — the weights are set in globals.css */}
      <span className="flex items-center gap-1" aria-hidden>
        {shown.colors.map((c, i) => (
          <span
            key={c + i}
            className="inline-block size-2 rounded-full"
            style={{ background: c }}
          />
        ))}
      </span>
    </motion.p>
  );
}
