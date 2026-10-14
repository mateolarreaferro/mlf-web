'use client';

/**
 * Buffers a streaming date into "beats" and lets the client control the pace.
 *
 * The engine runs as fast as the models allow (~7s a turn). The game needs to
 * stop between turns to take the player's guess. Rather than making the server
 * wait, which would hold a connection open on human timescales, the run streams
 * ahead into a buffer and the UI reveals one beat at a time. The player's
 * thinking time and the model's latency overlap, so the game never feels like it
 * is waiting on either.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  AffectRecord, DateConfig, DateEvent, Debrief, DisclosureDepth, PrivateGoals, Scene, Turn,
} from '@/lib/lovesims/types';

export interface Beat {
  index: number;
  sceneEvents: string[];
  turn: Turn;
  record?: AffectRecord;
}

export interface Participant { id: string; name: string; goals: PrivateGoals }

export type RunPhase = 'idle' | 'connecting' | 'streaming' | 'finished' | 'error';

export interface AgentSnapshot {
  id: string;
  name: string;
  valence: number;
  arousal: number;
  label?: string;
  intimacy: number;
  depth: DisclosureDepth;
  ceiling: DisclosureDepth;
  secret: string;
  secretOut: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function useDateRun() {
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [ending, setEnding] = useState<{ reason: string; minutes: number; turns: number } | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pendingScene = useRef<string[]>([]);

  const reset = useCallback(() => {
    setError(null); setScene(null); setParticipants([]);
    setBeats([]); setRevealed(0); setEnding(null); setDebrief(null);
    pendingScene.current = [];
  }, []);

  const start = useCallback(async (config: Partial<DateConfig>) => {
    abortRef.current?.abort();
    reset();
    setPhase('connecting');

    const controller = new AbortController();
    abortRef.current = controller;

    let res: Response;
    try {
      res = await fetch('/api/lovesims/date', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config),
        signal: controller.signal,
      });
    } catch {
      setError('Could not reach the simulation.'); setPhase('error'); return;
    }
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? 'The simulation refused to start.'); setPhase('error'); return;
    }

    setPhase('streaming');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as DateEvent;
          switch (ev.type) {
            case 'start':
              setScene(ev.scene);
              setParticipants(ev.agents);
              break;
            case 'scene_event':
              pendingScene.current.push(ev.text);
              break;
            case 'turn': {
              const sceneEvents = pendingScene.current;
              pendingScene.current = [];
              setBeats((b) => [...b, { index: ev.turn.index, sceneEvents, turn: ev.turn }]);
              break;
            }
            case 'affect':
              setBeats((b) => {
                const i = b.findIndex((x) => x.index === ev.record.turn);
                if (i < 0) return b;
                const next = [...b];
                next[i] = { ...next[i], record: ev.record };
                return next;
              });
              break;
            case 'end':
              setEnding({ reason: ev.reason, minutes: ev.minutes, turns: ev.turns });
              break;
            case 'debrief':
              setDebrief(ev.debrief);
              break;
            case 'error':
              setError(ev.message);
              break;
          }
        }
      }
      setPhase('finished');
    } catch (e) {
      if ((e as Error).name === 'AbortError') setPhase('finished');
      else { setError((e as Error).message); setPhase('error'); }
    }
  }, [reset]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setPhase('finished');
  }, []);

  /** A beat is playable once its affect record has landed. */
  const readyCount = useMemo(() => {
    let n = 0;
    for (const b of beats) {
      if (b.record) n++;
      else break;
    }
    // The final turn may never get a record if the run ended on an error.
    return phase === 'finished' ? beats.length : n;
  }, [beats, phase]);

  const canAdvance = revealed < readyCount;
  const advance = useCallback(() => setRevealed((r) => r + 1), []);
  const revealAll = useCallback(() => setRevealed(beats.length), [beats.length]);

  const visible = useMemo(() => beats.slice(0, revealed), [beats, revealed]);
  /** The beat the player is currently being asked about. */
  const pending = beats[revealed] ?? null;
  const current = visible[visible.length - 1] ?? null;

  const snapshots = useMemo(() => {
    const map = new Map<string, AgentSnapshot>();
    for (const p of participants) {
      map.set(p.id, {
        id: p.id, name: p.name,
        valence: 0, arousal: 0, label: undefined,
        intimacy: 0, depth: 0, ceiling: 1,
        secret: p.goals.secret, secretOut: false,
      });
    }
    for (const b of visible) {
      const speaker = map.get(b.turn.agentId);
      if (speaker) {
        speaker.depth = Math.max(speaker.depth, b.turn.depth) as DisclosureDepth;
        if (b.turn.depth === 4) speaker.secretOut = true;
      }
      if (b.record) {
        const listener = map.get(b.record.agentId);
        if (listener) {
          listener.valence = clamp(b.record.mood.valence + 0.6 * b.record.emotion.valence, -1, 1);
          listener.arousal = clamp(b.record.mood.arousal + 0.6 * b.record.emotion.arousal, -1, 1);
          listener.label = b.record.label;
          listener.intimacy = b.record.intimacy;
          listener.ceiling = b.record.ceiling;
        }
      }
    }
    return map;
  }, [participants, visible]);

  const minute = current?.turn.minute ?? 0;
  const bufferedAhead = Math.max(0, readyCount - revealed);

  return {
    phase, error, scene, participants,
    beats, visible, current, pending,
    revealed, readyCount, canAdvance, bufferedAhead,
    advance, revealAll, start, stop, reset,
    snapshots, minute, ending, debrief,
  };
}
