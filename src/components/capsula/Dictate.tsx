"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
  Talk instead of type: the browser's own speech recognition (Chrome,
  Safari, Edge) writes what you say into the answer, where it can be fixed
  before sending. Hidden where the browser has none. Nothing is recorded.
*/

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
  start(): void; stop(): void;
};

const noop = () => () => {};
const hasSpeech = () => {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
};

export default function Dictate({ current, onText }: { current: string; onText: (heard: string, base: string) => void }) {
  // Known only in the browser; the server renders no button.
  const supported = useSyncExternalStore(noop, hasSpeech, () => false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.stop(), []);

  if (!supported) return null;

  function toggle() {
    if (listening) return rec.current?.stop();
    const w = window as unknown as Record<string, new () => Recognition>;
    const r = new (w.SpeechRecognition || w.webkitSpeechRecognition)();
    r.lang = navigator.language.startsWith("es") ? navigator.language : "es-ES";
    r.continuous = true;
    r.interimResults = true;
    const base = current.trim();
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join("").trim(), base);
    r.onend = r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={listening ? "dejar de dictar" : "dictar la respuesta"}
      aria-pressed={listening}
      title={listening ? "dejar de dictar" : "dictar"}
      className={`flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
        listening ? "bg-accent text-paper" : "text-faint hover:bg-paper hover:text-ink"
      }`}
    >
      {listening ? (
        <span className="size-2.5 animate-pulse rounded-full bg-paper motion-reduce:animate-none" aria-hidden />
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
