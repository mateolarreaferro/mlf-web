'use client';

/**
 * The game.
 *
 * The loop: you read a line, guess how the other person took it, then watch their
 * face change and find out. The engine already knows the answer, it wrote the
 * appraisal before you guessed, so the score is real.
 *
 * What is being scored is deliberately *not* the couple's compatibility. It is
 * the player's empathic accuracy: how well you read one specific person over the
 * course of one evening. That keeps the research honesty intact (no compatibility
 * number is ever emitted) while making the responsiveness gap, the thing this
 * whole product exists to teach, into the thing you actually play against.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Portrait } from '@/components/lovesims/portrait';
import { Stage, type Side } from '@/components/lovesims/stage';
import { useDateRun, type Beat } from '@/components/lovesims/use-date-run';

const CH = ['#a3324e', '#136c6a'] as const;
type Guess = 'colder' | 'same' | 'warmer';

interface AgentSummary { id: string; name: string; age: number | null; blurb: string }
interface SceneSummary { id: string; name: string; place: string; city: string; description: string; timeBudget: number }
interface Catalog { agents: AgentSummary[]; pairs: [string, string][]; scenes: SceneSummary[]; liveAvailable: boolean; remaining: number | null }

const felt = (r: { mood: { valence: number }; emotion: { valence: number } }) =>
  Math.max(-1, Math.min(1, r.mood.valence + 0.6 * r.emotion.valence));

/* useSearchParams needs a Suspense boundary above it when the page is prerendered. */
export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <Play />
    </Suspense>
  );
}

function Play() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [pairIndex, setPairIndex] = useState(0);
  const [sceneId, setSceneId] = useState('jazz-bar');
  const [live, setLive] = useState(true);
  const [watchOnly, setWatchOnly] = useState(false);
  // ?demo=1 runs the whole game on the deterministic mock provider with a short
  // date. Lets the experience be shown, or regression-checked, at zero cost.
  const demo = useSearchParams().get('demo') === '1';

  const run = useDateRun();
  const [answered, setAnswered] = useState<{ beat: Beat; guess: Guess; actual: Guess } | null>(null);
  const [scores, setScores] = useState<{ agentId: string; correct: boolean; delta: number; beat: Beat }[]>([]);

  useEffect(() => {
    fetch('/api/lovesims/agents').then((r) => r.json()).then((c: Catalog) => {
      setCatalog(c);
      setLive(c.liveAvailable);
    }).catch(() => {});
  }, []);

  // The pairs are the cast's (cast.ts); the catalog carries them so one list rules.
  const pairs = useMemo(() => {
    if (!catalog) return [];
    const a = catalog.agents;
    return catalog.pairs.filter(([x, y]) => a.some((g) => g.id === x) && a.some((g) => g.id === y));
  }, [catalog]);

  const pair = pairs[pairIndex] ?? pairs[0] ?? ['tomas', 'ingrid'];
  const nameOf = useCallback(
    (id: string) => catalog?.agents.find((a) => a.id === id)?.name ?? id,
    [catalog],
  );

  const colourOf = useCallback((id: string) => {
    const i = run.participants.findIndex((p) => p.id === id);
    return CH[(i < 0 ? 0 : i) % 2];
  }, [run.participants]);

  // --- the listener whose reaction is being guessed --------------------------
  const pendingListenerId = useMemo(() => {
    if (!run.pending) return null;
    return run.participants.find((p) => p.id !== run.pending!.turn.agentId)?.id ?? null;
  }, [run.pending, run.participants]);

  const actualFor = useCallback((beat: Beat): Guess | null => {
    if (!beat.record) return null;
    const listenerId = beat.record.agentId;
    const prior = run.beats
      .filter((b) => b.index < beat.index && b.record?.agentId === listenerId)
      .pop();
    const before = prior?.record ? felt(prior.record) : 0;
    const delta = felt(beat.record) - before;
    return delta > 0.04 ? 'warmer' : delta < -0.04 ? 'colder' : 'same';
  }, [run.beats]);

  function guess(g: Guess) {
    const beat = run.pending;
    if (!beat?.record) return;
    const actual = actualFor(beat);
    if (!actual) return;
    const prior = run.beats.filter((b) => b.index < beat.index && b.record?.agentId === beat.record!.agentId).pop();
    const delta = felt(beat.record) - (prior?.record ? felt(prior.record) : 0);
    setAnswered({ beat, guess: g, actual });
    setScores((s) => [...s, { agentId: beat.record!.agentId, correct: g === actual, delta, beat }]);
    run.advance();
  }

  function next() {
    setAnswered(null);
    if (watchOnly) run.advance();
  }

  // Watch mode: pace it like a conversation instead of asking anything.
  useEffect(() => {
    if (!watchOnly || answered || !run.canAdvance) return;
    const t = setTimeout(() => run.advance(), 2200);
    return () => clearTimeout(t);
  }, [watchOnly, answered, run.canAdvance, run.revealed, run]);

  function begin() {
    setAnswered(null);
    setScores([]);
    run.start({
      agentAId: pair[0], agentBId: pair[1], sceneId,
      maxTurns: demo ? 8 : 22,
      live: demo ? false : live,
    });
  }

  const sides: [Side, Side] | null = useMemo(() => {
    if (run.participants.length < 2) return null;
    return run.participants.slice(0, 2).map((p, i) => {
      const s = run.snapshots.get(p.id)!;
      return {
        id: p.id, name: p.name, colour: CH[i % 2],
        valence: s.valence, arousal: s.arousal, label: s.label,
        intimacy: s.intimacy, depth: s.depth, ceiling: s.ceiling,
        secret: s.secret, secretOut: s.secretOut,
      };
    }) as [Side, Side];
  }, [run.participants, run.snapshots]);

  const correct = scores.filter((s) => s.correct).length;
  const accuracy = scores.length ? correct / scores.length : 0;
  const streak = useMemo(() => {
    let n = 0;
    for (let i = scores.length - 1; i >= 0 && scores[i].correct; i--) n++;
    return n;
  }, [scores]);

  const done = run.phase === 'finished' && !run.canAdvance && !answered;

  // ------------------------------------------------------------------ setup --
  if (run.phase === 'idle') {
    return (
      <Shell>
        <p className="mb-6 max-w-xl text-[15px] leading-relaxed text-neutral-600">
          Two people meet. You read every line and guess how it landed, then watch their face
          change and find out. You are not scoring them. You are scoring how well you read a person.
          The twelve people here are invented for this demo; the engine is the real one.
        </p>

        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">Pick a pair</h2>
        <div className="mb-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pairs.map((p, i) => (
            <button
              key={p.join()}
              onClick={() => setPairIndex(i)}
              className={`flex flex-col items-center rounded-xl border-2 px-3 py-3 transition-all ${
                i === pairIndex ? 'border-neutral-900 bg-white shadow-sm' : 'border-neutral-200 bg-white/60 hover:border-neutral-300'
              }`}
            >
              <span className="flex items-center justify-center">
                <Portrait agentId={p[0]} name={nameOf(p[0])} colour={CH[0]} valence={0.15} arousal={0.1} size={58} />
                <span className="-ml-2 scale-x-[-1]">
                  <Portrait agentId={p[1]} name={nameOf(p[1])} colour={CH[1]} valence={0.15} arousal={0.1} size={58} />
                </span>
              </span>
              <span className="mt-1 text-sm">
                <span className="font-semibold" style={{ color: CH[0] }}>{nameOf(p[0])}</span>
                <span className="mx-1 text-neutral-400">&amp;</span>
                <span className="font-semibold" style={{ color: CH[1] }}>{nameOf(p[1])}</span>
              </span>
            </button>
          ))}
        </div>

        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">Pick a room</h2>
        <div className="mb-8 flex flex-wrap gap-2">
          {catalog?.scenes.map((s) => (
            <button
              key={s.id}
              onClick={() => setSceneId(s.id)}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                s.id === sceneId ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
        <p className="mb-8 max-w-xl text-sm text-neutral-500">
          {catalog?.scenes.find((s) => s.id === sceneId)?.description}
        </p>

        <div className="flex flex-wrap items-center gap-5">
          <button onClick={begin} className="rounded-full bg-neutral-900 px-8 py-3.5 text-[15px] font-medium text-white hover:bg-neutral-700">
            Start the date
          </button>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={watchOnly} onChange={(e) => setWatchOnly(e.target.checked)} className="accent-neutral-800" />
            Just let me watch
          </label>
          {demo ? (
            <span className="font-mono text-[11px] text-neutral-400">demo mode: the stand-in provider, 8 turns, no model call</span>
          ) : catalog && !catalog.liveAvailable ? (
            <span className="font-mono text-[11px] text-neutral-400">the model is not connected, so this runs on the stand-in provider</span>
          ) : catalog && catalog.remaining !== null ? (
            <span className="font-mono text-[11px] text-neutral-400">
              {catalog.remaining === 0 ? 'the free dates are used up; the password opens more' : `${catalog.remaining} free ${catalog.remaining === 1 ? 'date' : 'dates'} left, each a few minutes of the model`}
            </span>
          ) : null}
        </div>
        {run.error && <p className="mt-4 font-mono text-[11px] text-[#a3324e]">{run.error}</p>}
      </Shell>
    );
  }

  // ------------------------------------------------------------------- play --
  return (
    <Shell>
      {sides && (
        <div className="mb-6">
          <Stage
            left={sides[0]}
            right={sides[1]}
            speakingId={(answered?.beat ?? run.pending)?.turn.agentId ?? null}
            minute={run.minute}
            timeBudget={run.scene?.timeBudget ?? 90}
          />
        </div>
      )}

      {/* scoreboard */}
      {!watchOnly && scores.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-neutral-200 bg-white px-5 py-3">
          <Metric label="You read them right" value={`${correct}/${scores.length}`} />
          <Metric label="Accuracy" value={`${(accuracy * 100).toFixed(0)}%`} />
          <Metric label="Streak" value={String(streak)} accent={streak >= 3} />
          {run.bufferedAhead > 0 && (
            <span className="ml-auto font-mono text-[10px] text-neutral-400">{run.bufferedAhead} turns ready</span>
          )}
        </div>
      )}

      {/* scene beat */}
      {(answered?.beat ?? run.pending)?.sceneEvents.map((t, i) => (
        <p key={i} className="mb-4 rounded-lg bg-neutral-100 px-4 py-2.5 text-center text-sm italic text-neutral-600">
          {t}
        </p>
      ))}

      {/* the line */}
      {(() => {
        const beat = answered?.beat ?? run.pending;
        if (!beat) {
          return (
            <p className="py-10 text-center font-mono text-sm text-neutral-400">
              {done ? '' : run.phase === 'connecting' ? 'they are arriving…' : 'thinking…'}
            </p>
          );
        }
        const colour = colourOf(beat.turn.agentId);
        const speaker = run.participants.find((p) => p.id === beat.turn.agentId);
        return (
          <article className="mb-5 rounded-2xl border-2 bg-white px-6 py-5" style={{ borderColor: `${colour}33` }}>
            <div className="mb-2 flex items-baseline gap-3">
              <span className="text-base font-semibold" style={{ color: colour }}>{speaker?.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-400">
                {beat.turn.kind} · depth {beat.turn.depth}
              </span>
            </div>
            <p className="text-[17px] leading-relaxed text-neutral-900">
              {beat.turn.kind === 'silence' ? <span className="italic text-neutral-400">(says nothing)</span> : beat.turn.text}
            </p>
            {beat.turn.gesture && <p className="mt-2 text-sm italic text-neutral-500">[{beat.turn.gesture}]</p>}
          </article>
        );
      })()}

      {/* the ask */}
      {!watchOnly && !answered && run.pending?.record && pendingListenerId && (
        <div className="mb-8 rounded-2xl border border-neutral-900/10 bg-neutral-900 px-6 py-5 text-white">
          <p className="mb-4 text-[15px]">
            How did <strong style={{ color: colourOf(pendingListenerId) === CH[0] ? '#f0a0b4' : '#7fd6cf' }}>
              {nameOf(pendingListenerId)}
            </strong> take that?
          </p>
          <div className="flex flex-wrap gap-2.5">
            {(['colder', 'same', 'warmer'] as Guess[]).map((g) => (
              <button
                key={g}
                onClick={() => guess(g)}
                className="rounded-full border border-white/25 px-6 py-2.5 text-sm transition-colors hover:bg-white hover:text-neutral-900"
              >
                {g === 'colder' ? 'Cooled off' : g === 'same' ? 'About the same' : 'Warmed up'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* the reveal */}
      {answered && answered.beat.record && (
        <div
          className="mb-8 rounded-2xl border-2 px-6 py-5"
          style={{
            borderColor: answered.guess === answered.actual ? '#136c6a' : '#a3324e',
            background: answered.guess === answered.actual ? '#136c6a0d' : '#a3324e0d',
          }}
        >
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{ color: answered.guess === answered.actual ? '#136c6a' : '#a3324e' }}>
            {answered.guess === answered.actual ? 'you read that right' : 'you misread that'}
          </p>
          <p className="text-[15px] leading-relaxed text-neutral-800">
            {nameOf(answered.beat.record.agentId)} felt <strong>{answered.beat.record.label}</strong>
            {answered.guess !== answered.actual && <>, they actually {answered.actual === 'same' ? 'held about steady' : answered.actual === 'warmer' ? 'warmed up' : 'cooled off'}.</>}
          </p>
          <p className="mt-2 text-sm italic leading-relaxed text-neutral-600">
            {answered.beat.record.appraisal.note}
          </p>
          {Math.abs(answered.beat.record.responsivenessGap) > 0.05 && (
            <p className="mt-3 border-t border-neutral-900/10 pt-3 font-mono text-[11px] leading-relaxed text-neutral-500">
              And they misread it too: they took it{' '}
              {answered.beat.record.responsivenessGap < 0 ? 'colder' : 'warmer'} than it was actually meant
              ({answered.beat.record.responsivenessGap >= 0 ? '+' : ''}{answered.beat.record.responsivenessGap.toFixed(2)}).
            </p>
          )}
          <button onClick={next} className="mt-4 rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-700">
            {/* `done` is false while this reveal is still on screen, so the
                end-of-date case has to be detected from the run, not from it. */}
            {run.canAdvance ? 'Next line' : run.phase === 'finished' ? 'See how you did' : 'Waiting for them…'}
          </button>
        </div>
      )}

      {watchOnly && run.canAdvance && (
        <p className="mb-8 font-mono text-[11px] text-neutral-400">watching…</p>
      )}

      {/* the reel */}
      {done && <Reel
        scores={scores}
        nameOf={nameOf}
        colourOf={colourOf}
        run={run}
        onAgain={() => { run.reset(); setScores([]); setAnswered(null); }}
      />}

      {/* history */}
      {run.visible.length > 1 && (
        <details className="mt-10 rounded-xl border border-neutral-200 bg-white">
          <summary className="cursor-pointer px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500">
            everything they said ({run.visible.length})
          </summary>
          <ol className="divide-y divide-neutral-100 border-t border-neutral-100">
            {run.visible.map((b) => (
              <li key={b.index} className="px-5 py-3">
                <span className="font-mono text-[10px] text-neutral-400">{b.turn.minute}′ </span>
                <span className="text-sm font-semibold" style={{ color: colourOf(b.turn.agentId) }}>
                  {run.participants.find((p) => p.id === b.turn.agentId)?.name}
                </span>
                <p className="mt-0.5 text-sm leading-relaxed text-neutral-700">{b.turn.text}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------

function Reel({ scores, nameOf, colourOf, run, onAgain }: {
  scores: { agentId: string; correct: boolean; delta: number; beat: Beat }[];
  nameOf: (id: string) => string;
  colourOf: (id: string) => string;
  run: ReturnType<typeof useDateRun>;
  onAgain: () => void;
}) {
  const byAgent = new Map<string, { correct: number; total: number }>();
  for (const s of scores) {
    const e = byAgent.get(s.agentId) ?? { correct: 0, total: 0 };
    e.total++; if (s.correct) e.correct++;
    byAgent.set(s.agentId, e);
  }
  const worst = scores.filter((s) => !s.correct).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  const correct = scores.filter((s) => s.correct).length;
  const pct = scores.length ? Math.round((correct / scores.length) * 100) : 0;

  return (
    <section className="mb-4 rounded-2xl border border-neutral-200 bg-white px-6 py-7">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-400">the evening ended</p>
      <p className="mt-1 text-sm text-neutral-600">
        {run.ending?.reason} · {run.ending?.minutes} minutes · {run.ending?.turns} turns
      </p>

      {scores.length > 0 && (
        <>
          <p className="mt-6 font-serif text-5xl tabular-nums">{pct}%</p>
          <p className="mt-1 text-[15px] text-neutral-600">
            You read them right {correct} times out of {scores.length}.
          </p>

          <div className="mt-5 flex flex-wrap gap-6">
            {[...byAgent.entries()].map(([id, e]) => (
              <div key={id}>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: colourOf(id) }}>{nameOf(id)}</p>
                <p className="text-lg tabular-nums text-neutral-800">{e.correct}/{e.total}</p>
              </div>
            ))}
          </div>

          {worst && (
            <div className="mt-6 rounded-xl border-l-2 border-[#a3324e] bg-[#a3324e]/5 px-5 py-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a3324e]">
                where you misread them worst, minute {worst.beat.turn.minute}
              </p>
              <p className="text-sm italic leading-relaxed text-neutral-700">&ldquo;{worst.beat.turn.text}&rdquo;</p>
              <p className="mt-2 text-sm text-neutral-600">
                {nameOf(worst.agentId)} moved {worst.delta >= 0 ? 'up' : 'down'} {Math.abs(worst.delta).toFixed(2)} on that line.
                What did you miss?
              </p>
            </div>
          )}
        </>
      )}

      {run.debrief && (
        <div className="mt-7 border-t border-neutral-100 pt-6">
          <h3 className="mb-3 font-serif text-xl">What happened between them</h3>
          <ol className="space-y-2">
            {run.debrief.moments.map((m) => (
              <li key={`${m.kind}-${m.turn}`} className="rounded-lg bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-900">{m.minute}′, {m.label}</p>
                <p className="mt-0.5 text-sm italic text-neutral-600">&ldquo;{m.excerpt.slice(0, 130)}{m.excerpt.length > 130 ? '…' : ''}&rdquo;</p>
              </li>
            ))}
          </ol>
          {run.debrief.sharedInterests.length > 0 && (
            <p className="mt-4 text-sm text-neutral-600">
              They both kept coming back to{' '}
              <strong>{run.debrief.sharedInterests.map((s) => s.topic).slice(0, 3).join(', ')}</strong>.
            </p>
          )}
        </div>
      )}

      <div className="mt-7 flex flex-wrap gap-3">
        <button onClick={onAgain} className="rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-700">
          Another date
        </button>
        <Link href="/lovesims/date" className="rounded-full border border-neutral-300 px-6 py-2.5 text-sm text-neutral-700 hover:border-neutral-400">
          Open the analyst view
        </Link>
      </div>
    </section>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-neutral-400">{label}</p>
      <p className={`text-lg tabular-nums ${accent ? 'text-[#a3324e]' : 'text-neutral-900'}`}>{value}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl py-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <Link href="/lovesims" className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-400 hover:text-neutral-700">
          LoveSims <span className="text-[#a3324e]">v2</span>
        </Link>
        <span className="flex items-baseline gap-5">
          <Link href="/lovesims/date" className="font-mono text-[11px] text-neutral-400 underline underline-offset-2 hover:text-neutral-700">
            analyst view
          </Link>
          <Link href="/?project=love-simulations" className="font-mono text-[11px] text-neutral-400 underline underline-offset-2 hover:text-neutral-700">
            mateolarreaferro.com
          </Link>
        </span>
      </header>
      <h1 className="mb-4 font-serif text-4xl leading-tight">Can you tell how that landed?</h1>
      {children}
    </div>
  );
}
