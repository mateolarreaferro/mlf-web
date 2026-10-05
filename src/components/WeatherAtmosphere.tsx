"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Atmosphere } from "@/lib/weather-theme";
import { followTheDay, setDaylight } from "@/lib/mood";

/* fired on window after the forecast is applied, for anything that caches what it changed */
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
  Fetches the visitor's current conditions, hands the real sunrise and
  sunset to the mood and the wind to the blobs' drift (their colours are
  fixed, see globals.css), and says in the header where that weather is.

  Where that is comes from the edge's guess at the IP address, which is right
  about the region and often wrong about the town, so the line says "near
  boston" rather than asserting a place. Pressing it is the one way to do
  better: it asks the browser for the real position (a prompt only ever
  raised by that press), rounds it to about a kilometre, and remembers it in
  this browser for a month. Then the line names the town without the "near".

  A page left open asks again every quarter hour, so an afternoon turning to
  evening reaches the page without anyone reloading it.
*/

export default function WeatherAtmosphere() {
  const [shown, setShown] = useState<{
    city: string;
    precise: boolean;
    temperature: number;
  } | null>(null);

  const alive = useRef(true);
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
          // the blobs keep attractor.world's colours; the wind only sets their pace
          const root = document.documentElement;
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
          });
        }
      };

      reveal();
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
      className="label hidden cursor-pointer items-center hover:text-ink sm:flex"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      title={
        shown.precise
          ? "the light drifts with the wind here · press to update where you are"
          : "the light drifts with the wind near you · press to use your exact location"
      }
    >
      <span>
        {shown.precise ? "" : "near "}
        {shown.city.toLowerCase()} · {Math.round(shown.temperature)}°c
      </span>
    </motion.button>
  );
}
