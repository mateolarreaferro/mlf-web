"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Atmosphere } from "@/lib/weather-theme";
import { followTheDay, setDaylight } from "@/lib/mood";

const FADE_MS = 700; // must match the opacity transition in globals.css
/* fired on window after the wash colours are written, for anything that caches them */
export const ATMOSPHERE_EVENT = "mlf:atmosphere";

/* a place the visitor chose to share, kept in their browser only */
const PLACE_KEY = "mlf:place";
const PLACE_TTL = 30 * 24 * 60 * 60 * 1000;
/* how often a page left open asks again, so it keeps following the day */
const REFRESH_MS = 15 * 60 * 1000;

type Place = { lat: number; lon: number; until: number };

type WeatherResponse = {
  ok: boolean;
  precise?: boolean;
  city?: string | null;
  weather?: { temperature: number };
  atmosphere?: Atmosphere;
};

function readPlace(): Place | null {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Place;
    if (typeof p.lat !== "number" || typeof p.lon !== "number" || p.until < Date.now()) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

function writePlace(p: Place) {
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(p));
  } catch {
    // private window or blocked storage: it still works for this visit
  }
}

/*
  Fetches the visitor's current conditions, hands the colours to CSS as custom
  properties (globals.css owns what they look like), and states plainly in the
  header where the colours came from.

  Where that is comes from the edge's guess at the IP address, which is right
  about the region and often wrong about the town, so the line says "near
  boston" rather than asserting a place. Pressing it is the one way to do
  better: it asks the browser for the real position (a prompt only ever
  raised by that press), rounds it to about a kilometre, and remembers it in
  this browser for a month. Then the line names the town without the "near".

  The swap happens behind a fade: the washes drop to opacity 0, the colours
  change while they are invisible, and they come back up. Custom properties
  can't be transitioned reliably (see the note in globals.css), so the motion
  lives on opacity instead — the page takes one slow breath when the weather
  arrives rather than flickering to a new colour. A page left open asks again
  every quarter hour and breathes only if something actually changed, so an
  afternoon turning to evening reaches the page without anyone reloading it.
*/

export default function WeatherAtmosphere() {
  const [shown, setShown] = useState<{
    city: string;
    precise: boolean;
    temperature: number;
    colors: [string, string, string];
  } | null>(null);

  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastApplied = useRef("");
  const lastAt = useRef(0);

  const load = useCallback(async (place: Place | null) => {
    const url = place ? `/api/weather?lat=${place.lat}&lon=${place.lon}` : "/api/weather";
    try {
      const res = await fetch(url);
      const data = (await res.json()) as WeatherResponse;
      if (!alive.current || !data.ok || !data.atmosphere || !data.weather) return;
      lastAt.current = Date.now();

      const atmosphere = data.atmosphere;
      // real sunrise and sunset for this spot: the mood follows it from here
      setDaylight(atmosphere.isDay);

      const key = JSON.stringify(atmosphere);
      const changed = key !== lastApplied.current;
      lastApplied.current = key;

      const reveal = () => {
        if (!alive.current) return;
        if (changed) {
          const root = document.documentElement;
          root.style.setProperty("--w1", atmosphere.colors[0]);
          root.style.setProperty("--w2", atmosphere.colors[1]);
          root.style.setProperty("--w3", atmosphere.colors[2]);
          root.style.setProperty("--w-alpha", String(atmosphere.alpha));
          root.style.setProperty("--w-drift-a", `${atmosphere.driftA}s`);
          root.style.setProperty("--w-drift-b", `${atmosphere.driftB}s`);
          window.dispatchEvent(new CustomEvent(ATMOSPHERE_EVENT));
        }
        // only name a place we actually have one for
        if (data.city) {
          setShown({
            city: data.city,
            precise: data.precise === true,
            temperature: data.weather!.temperature,
            colors: atmosphere.colors,
          });
        }
      };

      const root = document.documentElement;
      if (!changed || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        reveal();
        return;
      }

      root.dataset.wash = "hold";
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        reveal();
        delete root.dataset.wash;
      }, FADE_MS);
    } catch {
      // decoration: a failure here should be invisible
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    followTheDay();
    load(readPlace());

    // follow the day while the page is open, but never work in a hidden tab
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastAt.current < REFRESH_MS) return;
      load(readPlace());
    };
    const interval = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const locate = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // ~1 km is enough to name the town and as much as ever leaves the browser
        const round = (n: number) => Math.round(n * 100) / 100;
        const place = {
          lat: round(pos.coords.latitude),
          lon: round(pos.coords.longitude),
          until: Date.now() + PLACE_TTL,
        };
        writePlace(place);
        load(place);
      },
      () => {
        // declined or unavailable: the line stays as it was
      },
      { maximumAge: 10 * 60 * 1000, timeout: 10_000 },
    );
  };

  if (!shown) return null;

  return (
    <motion.button
      type="button"
      onClick={locate}
      className="label hidden cursor-pointer items-center gap-2 hover:text-ink sm:flex"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      title={
        shown.precise
          ? "the colours follow the weather here · press to update where you are"
          : "the colours follow the weather near you · press to use your exact location"
      }
    >
      <span>
        {shown.precise ? "" : "near "}
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
    </motion.button>
  );
}
