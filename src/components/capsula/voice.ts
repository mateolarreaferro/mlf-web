"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
  The interview's two halves of speech. useVoice reads the interviewer's
  messages aloud (ElevenLabs, through /api/capsula/voice). useRecorder
  records a spoken answer with MediaRecorder and has it written out
  (Whisper, through /api/capsula/listen), so it works in every browser with a
  microphone, not only the ones with speech recognition. Nothing is kept:
  the audio goes up, the text comes back.
*/

/* ---------- a small remembered setting ---------- */

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };

/** A string kept in localStorage, read the same on the server as `fallback`. */
export function useStored(key: string, fallback: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(subscribe, () => read(key) ?? fallback, () => fallback);
  const set = useCallback((v: string) => {
    try { localStorage.setItem(key, v); } catch {}
    listeners.forEach((fn) => fn());
  }, [key]);
  return [value, set];
}

/* ---------- the interviewer's voice ---------- */

export function useVoice(username: string) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, string>());
  const turn = useRef(0);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const stop = useCallback(() => {
    turn.current++;
    audio.current?.pause();
    setSpeaking(null);
    setLoading(null);
  }, []);

  const say = useCallback(async (id: string, text: string) => {
    stop();
    const mine = turn.current;
    let url = urls.current.get(id);
    if (!url) {
      setLoading(id);
      const response = await fetch("/api/capsula/voice", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, text }),
      }).catch(() => null);
      if (mine !== turn.current) return;
      setLoading(null);
      if (!response?.ok) return;
      url = URL.createObjectURL(await response.blob());
      urls.current.set(id, url);
      if (mine !== turn.current) return;
    }
    const a = (audio.current ??= new Audio());
    a.src = url;
    a.onended = () => setSpeaking(null);
    setSpeaking(id);
    try {
      await a.play();
      setBlocked(false);
    } catch {
      // A page opened without a press may not play sound until the first one.
      setSpeaking(null);
      setBlocked(true);
    }
  }, [username, stop]);

  useEffect(() => {
    const held = urls.current;
    return () => {
      audio.current?.pause();
      held.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  return { say, stop, speaking, loading, blocked };
}

/* ---------- the spoken answer ---------- */

const MAX_SECONDS = 600;
const noop = () => () => {};
const canRecord = () => typeof MediaRecorder !== "undefined" && "mediaDevices" in navigator;

type Held = { recorder: MediaRecorder; stream: MediaStream; context: AudioContext; timer: number; keep: boolean };

export function useRecorder(username: string, onText: (text: string) => void) {
  const supported = useSyncExternalStore(noop, canRecord, () => false);
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const held = useRef<Held | null>(null);
  const deliver = useRef(onText);
  useEffect(() => { deliver.current = onText; });

  const stop = useCallback(() => {
    if (held.current?.recorder.state === "recording") held.current.recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    if (held.current) held.current.keep = false;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return setError("No tengo permiso para usar el micrófono. Revísalo en el navegador.");
    }
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const context = new AudioContext();
    const node = context.createAnalyser();
    node.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(node);

    const began = Date.now();
    const mine: Held = { recorder, stream, context, keep: true, timer: 0 };
    mine.timer = window.setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);

    recorder.onstop = async () => {
      clearInterval(mine.timer);
      stream.getTracks().forEach((t) => t.stop());
      context.close().catch(() => {});
      held.current = null;
      setAnalyser(null);
      // Under a second is a slip of the finger, not an answer.
      if (!mine.keep || Date.now() - began < 1000 || !chunks.length) return setState("idle");
      setState("working");
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      try {
        const response = await fetch(`/api/capsula/listen?u=${encodeURIComponent(username)}`, {
          method: "POST", headers: { "Content-Type": blob.type }, body: blob,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) setError(data.error ?? "No pude entender la grabación. Intenta otra vez.");
        else if (data.text) deliver.current(data.text);
        else setError("No escuché nada. Intenta otra vez, un poco más cerca.");
      } catch {
        setError("Sin conexión. Intenta otra vez.");
      }
      setState("idle");
    };

    held.current = mine;
    setAnalyser(node);
    setSeconds(0);
    setState("recording");
    recorder.start(1000);
  }, [username, stop]);

  useEffect(() => () => {
    if (held.current) held.current.keep = false;
    if (held.current?.recorder.state === "recording") held.current.recorder.stop();
  }, []);

  return { supported, state, seconds, error, analyser, start, stop, cancel };
}
