"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/*
  Full screen for a piece in a card (Rats & Children, the sketches): the
  element itself goes full screen, not the page. Safari still wants the
  webkit names. iPhone Safari only lets video do this, so `can` is false
  there and the button is not drawn. The server (a deep link renders the
  card) says false too, so hydration agrees.
*/

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = () => document as WebkitDocument;
const current = () => document.fullscreenElement ?? doc().webkitFullscreenElement ?? null;
const still = () => () => {};
const no = () => false;
const fullscreenable = () => Boolean(document.fullscreenEnabled || doc().webkitFullscreenEnabled);

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const can = useSyncExternalStore(still, fullscreenable, no);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const change = () => setFull(current() !== null && current() === ref.current);
    document.addEventListener("fullscreenchange", change);
    document.addEventListener("webkitfullscreenchange", change);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      document.removeEventListener("webkitfullscreenchange", change);
    };
  }, [ref]);

  const toggle = () => {
    const el = ref.current as WebkitElement | null;
    if (!el) return;
    if (current()) void (document.exitFullscreen?.() ?? doc().webkitExitFullscreen?.());
    else void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
  };

  return { can, full, toggle };
}

export default function FullscreenButton({
  full,
  onClick,
  className = "",
}: {
  full: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={full ? "Leave full screen" : "Full screen"}
      className={`absolute bottom-3 right-3 z-20 flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/80 text-black backdrop-blur-sm transition-colors hover:bg-white ${className}`}
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        {full ? (
          <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
        ) : (
          <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
        )}
      </svg>
    </button>
  );
}
