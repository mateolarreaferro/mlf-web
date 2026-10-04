"use client";

import { useSyncExternalStore } from "react";

/*
  Wide is where the first viewport splits in two (Tailwind's lg, 1024px):
  the hero or a project's copy on the left, the graph or its card on the
  right. Below it the page is one column and a project opens as a
  full-screen sheet instead (ProjectSheet), because a card in the graph box
  left the phone looking at a picture with its words a screen away.

  The server cannot know, so it answers wide; the home page's first
  viewport is rendered on the client anyway (useSearchParams under
  Suspense), so phones never paint the wide layout.
*/
export const WIDE = "(min-width: 1024px)";

const subscribe = (change: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};

export function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}
