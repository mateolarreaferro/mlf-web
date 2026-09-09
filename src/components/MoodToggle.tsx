"use client";

import { useSyncExternalStore } from "react";
import { FaRegMoon, FaRegSun } from "react-icons/fa6";
import { currentMood, isOverridden, subscribe, toggleMood } from "@/lib/mood";

/*
  One button, no menu. It shows the mood the page is in and pressing it gives
  you the other one. Whether that sticks or the page goes back to following the
  day is decided in src/lib/mood.ts; the title says which is happening.
*/
const snapshot = () => `${currentMood()}|${isOverridden() ? "held" : "auto"}`;
const serverSnapshot = () => "";

export default function MoodToggle() {
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  // nothing until hydrated, so the server markup never shows the wrong glyph
  if (!snap) return <span className="inline-block size-8" aria-hidden />;

  const [mood, state] = snap.split("|");
  const dark = mood === "dark";
  const held = state === "held";
  const title = held
    ? `${mood} for now, back to following the day in a few hours`
    : `${mood}, following the day where you are · press for ${dark ? "light" : "dark"}`;

  return (
    <button
      type="button"
      onClick={toggleMood}
      aria-label={`switch to ${dark ? "light" : "dark"} mood`}
      aria-pressed={held}
      title={title}
      className="label -my-1.5 flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:text-accent"
    >
      {dark ? <FaRegMoon className="size-3.5" aria-hidden /> : <FaRegSun className="size-3.5" aria-hidden />}
    </button>
  );
}
