"use client";

import { useEffect } from "react";
import { sfxHover, sfxPress } from "@/lib/sfx";

/*
  One document-level listener set instead of wiring every component: any
  link or button gets the hover/press tones. The graph's canvas nodes call
  the same tones from their own hit-testing in KnowledgeGraph.
*/

const INTERACTIVE = "a, button, [role='button']";

export default function SoundEffects() {
  useEffect(() => {
    const over = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const el = (e.target as Element | null)?.closest?.(INTERACTIVE);
      if (!el) return;
      // pointerover re-fires on every child; only sound the actual entry
      const from = e.relatedTarget as Node | null;
      if (from && el.contains(from)) return;
      sfxHover();
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.(INTERACTIVE)) sfxPress();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if ((e.target as Element | null)?.closest?.(INTERACTIVE)) sfxPress();
    };
    document.addEventListener("pointerover", over, true);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, []);
  return null;
}
