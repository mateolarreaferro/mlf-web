"use client";

import { useSyncExternalStore } from "react";

/*
  What passes between the piece (in the card) and its panel (in the left
  column, RatsPanel): the piece publishes what is happening a few times a
  second, the panel publishes the visitor's settings. Two little stores,
  read with useSyncExternalStore, so neither side re-renders the other's
  tree and the piece never re-renders at all.
*/

export type Listen = "all" | "red" | "yellow";

export type Settings = {
  listen: Listen; // which beings you hear
  tone: number; // 0..1, the low-pass filter's opening (1 = open)
  volume: number; // 0..1
  speed: number; // 0.25..2, how fast the world runs
  disasters: number; // 0..2, how often they fall (1 = as composed, 0 = never)
};

export const DEFAULT_SETTINGS: Settings = { listen: "all", tone: 1, volume: 0.8, speed: 1, disasters: 1 };

export type Stats = {
  playing: boolean;
  red: number;
  yellow: number;
  normal: number;
  small: number;
  tiny: number;
  born: number;
  died: number;
  collisions: number;
  disasters: number;
  sky: number; // 0 night .. 1 day
  ring: number; // 0..1, how open the grey circle is
  voices: number;
  layers: string[]; // beds playing besides day/night
  history: number[]; // population, one sample a second, the last minute
};

export const EMPTY_STATS: Stats = {
  playing: false,
  red: 0,
  yellow: 0,
  normal: 0,
  small: 0,
  tiny: 0,
  born: 0,
  died: 0,
  collisions: 0,
  disasters: 0,
  sky: 0.5,
  ring: 0,
  voices: 0,
  layers: [],
  history: [],
};

function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export const stats = store<Stats>(EMPTY_STATS);
export const settings = store<Settings>(DEFAULT_SETTINGS);

export function useStats() {
  return useSyncExternalStore(stats.subscribe, stats.get, () => EMPTY_STATS);
}

export function useSettings() {
  return useSyncExternalStore(settings.subscribe, settings.get, () => DEFAULT_SETTINGS);
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings.set({ ...settings.get(), [key]: value });
}
