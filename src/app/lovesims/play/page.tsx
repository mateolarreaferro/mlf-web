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
 *
 * It plays in the terminal (components/lovesims/terminal.tsx): every line types
 * itself, the guesses are the keys 1, 2 and 3, Enter is the next line.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PixelPortrait } from '@/components/lovesims/portrait';
import { Stage, type Side } from '@/components/lovesims/stage';
import { Boot, Btn, Check, CHANNELS, Frame, Label, Typed, bar, useReducedMotion } from '@/components/lovesims/terminal';
import { useDateRun, type Beat } from '@/components/lovesims/use-date-run';

const CH = CHANNELS;
type Guess = 'colder' | 'same' | 'warmer';
const GUESSES: { g: Guess; key: string; label: string }[] = [
  { g: 'colder', key: '1', label: 'cooled off' },
  { g: 'same', key: '2', label: 'about the same' },
  { g: 'warmer', key: '3', label: 'warmed up' },
];

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
  const [booted, setBooted] = useState(false);
  // ?demo=1 runs the whole game on the deterministic mock provider with a short
  // date. Lets the experience be shown, or regression-checked, at zero cost.
  const demo = useSearchParams().get('demo') === '1';
  const reduced = useReducedMotion();

  const run = useDateRun();
  const [answered, setAnswered] = useState<{ beat: Beat; guess: Guess; actual: Guess } | null>(null);
  const [scores, setScores] = useState<{ agentId: string; correct: boolean; delta: number; beat: Beat }[]>([]);
  // The beat whose line has finished typing (or was skipped): the guesses wait for it.
  const [typedFor, setTypedFor] = useState<number | null>(null);

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

  const guess = useCallback((g: Guess) => {
    const beat = run.pending;
    if (!beat?.record) return;
    const actual = actualFor(beat);
    if (!actual) return;
    const prior = run.beats.filter((b) => b.index < beat.index && b.record?.agentId === beat.record!.agentId).pop();
    const delta = felt(beat.record) - (prior?.record ? felt(prior.record) : 0);
    setAnswered({ beat, guess: g, actual });
    setScores((s) => [...s, { agentId: beat.record!.agentId, correct: g === actual, delta, beat }]);
    run.advance();
  }, [run, actualFor]);

  const next = useCallback(() => {
    setAnswered(null);
    if (watchOnly) run.advance();
  }, [watchOnly, run]);

  // Watch mode: pace it like a conversation instead of asking anything.
  useEffect(() => {
    if (!watchOnly || answered || !run.canAdvance) return;
    const t = setTimeout(() => run.advance(), 2200);
    return () => clearTimeout(t);
  }, [watchOnly, answered, run.canAdvance, run.revealed, run]);

  function begin() {
    setAnswered(null);
    setScores([]);
    setTypedFor(null);
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
  const beat = answered?.beat ?? run.pending;
  const lineDone = !!beat && typedFor === beat.index;
  const asking = !watchOnly && !answered && !!run.pending?.record && !!pendingListenerId && lineDone;

  // The keys: 1, 2, 3 answer, Enter (or space) goes on, any key finishes a line that is still typing.
  useEffect(() => {
    if (run.phase === 'idle') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      if (beat && !lineDone && !answered) { setTypedFor(beat.index); return; }
      if (asking) {
        const hit = GUESSES.find((x) => x.key === e.key);
        if (hit) { e.preventDefault(); guess(hit.g); }
        return;
      }
      if (answered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run.phase, beat, lineDone, answered, asking, guess, next]);

  const status = demo
    ? 'demo: stand-in provider, 8 turns'
    : catalog && !catalog.liveAvailable
      ? 'model offline: stand-in provider'
      : catalog && catalog.remaining !== null
        ? catalog.remaining === 0 ? 'free dates: 0 (password opens more)' : `free dates: ${catalog.remaining}`
        : catalog ? 'unlocked' : 'connecting';

  // ------------------------------------------------------------------ setup --
  if (run.phase === 'idle') {
    const bootLines = [
      'lovesims v2, a date engine',
      catalog ? `cast loaded: ${catalog.agents.length} people, ${pairs.length} pairs, ${catalog.scenes.length} rooms` : 'loading cast ...',
      demo ? 'provider: stand-in (demo, no model call)' : catalog && !catalog.liveAvailable ? 'provider: stand-in (model not connected)' : 'provider: claude, live',
      'ready.',
    ];
    return (
      <Frame status={status}>
        <h1 className="ls-title mb-5 text-[13px] sm:text-[15px]">CAN YOU TELL HOW THAT LANDED?</h1>
        {catalog && !booted && !reduced ? (
          <Boot lines={bootLines} onDone={() => setBooted(true)} />
        ) : catalog ? (
          <>
            <div className="ls-dim mb-5 space-y-0.5">
              {bootLines.map((l) => <p key={l}>&gt; {l}</p>)}
            </div>
            <p className="mb-6 max-w-xl leading-snug">
              Two people meet. You read every line and guess how it landed, then watch their face
              change and find out. You are not scoring them. You are scoring how well you read a person.
              The twelve people here are invented for this demo; the engine is the real one.
            </p>

            <Label className="mb-2">&gt; pick a pair</Label>
            <div className="mb-7 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {pairs.map((p, i) => {
                const on = i === pairIndex;
                return (
                  <button
                    key={p.join()}
                    type="button"
                    onClick={() => setPairIndex(i)}
                    aria-pressed={on}
                    className="flex flex-col items-center border-2 px-2 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-dashed"
                    style={{ borderColor: on ? 'var(--ls-ph)' : 'var(--ls-line)', background: on ? 'var(--soft)' : 'transparent', outlineColor: 'var(--ls-hi)' }}
                  >
                    <span className="flex items-center justify-center gap-1">
                      <span className="w-16"><PixelPortrait agentId={p[0]} name={nameOf(p[0])} colour={CH[0]} valence={0.15} arousal={0.1} size={80} /></span>
                      <span className="w-16 -scale-x-100"><PixelPortrait agentId={p[1]} name={nameOf(p[1])} colour={CH[1]} valence={0.15} arousal={0.1} size={80} /></span>
                    </span>
                    <span className="mt-2 text-[18px] uppercase leading-none">
                      <span style={{ color: CH[0] }}>{nameOf(p[0])}</span>
                      <span className="ls-dim"> &amp; </span>
                      <span style={{ color: CH[1] }}>{nameOf(p[1])}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <Label className="mb-2">&gt; pick a room</Label>
            <div className="mb-2 flex flex-wrap gap-x-1 gap-y-1">
              {catalog.scenes.map((s) => (
                <Btn key={s.id} onClick={() => setSceneId(s.id)} on={s.id === sceneId}>{s.name}</Btn>
              ))}
            </div>
            <p className="ls-dim mb-7 max-w-xl leading-snug">
              {catalog.scenes.find((s) => s.id === sceneId)?.description}
            </p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Btn big onClick={begin}>start the date</Btn>
              <Check checked={watchOnly} onChange={setWatchOnly}>just let me watch</Check>
            </div>
            <p className="ls-dim mt-3 text-[17px]">
              {demo
                ? 'demo mode: the stand-in provider, 8 turns, no model call'
                : !catalog.liveAvailable
                  ? 'the model is not connected, so this runs on the stand-in provider'
                  : catalog.remaining === null
                    ? 'live model, unlocked'
                    : catalog.remaining === 0
                      ? 'the free dates are used up; the password opens more'
                      : `${catalog.remaining} free ${catalog.remaining === 1 ? 'date' : 'dates'} left, each a few minutes of the model`}
            </p>
            {run.error && <p className="mt-4" style={{ color: 'var(--ls-err)' }}>ERR {run.error}</p>}
          </>
        ) : (
          <p className="ls-dim"><Typed text="loading cast ..." cap={600} /></p>
        )}
      </Frame>
    );
  }

  // ------------------------------------------------------------------- play --
  return (
    <Frame status={status}>
      {sides && (
        <div className="mb-7">
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
        <p className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[18px]">
          <span><span className="ls-dim">read right </span>{correct}/{scores.length}</span>
          <span><span className="ls-dim">accuracy </span>{(accuracy * 100).toFixed(0)}%</span>
          <span><span className="ls-dim">streak </span><span style={{ color: streak >= 3 ? 'var(--ls-hi)' : undefined }}>{streak}</span></span>
          {run.bufferedAhead > 0 && <span className="ls-dim ml-auto">{run.bufferedAhead} turns buffered</span>}
        </p>
      )}

      {/* scene beat */}
      {beat?.sceneEvents.map((t, i) => (
        <p key={i} className="ls-dim mb-3">
          <span style={{ color: 'var(--ls-hi)' }}>** </span>{t}
        </p>
      ))}

      {/* the line */}
      {(() => {
        if (!beat) {
          if (done) return null;
          return (
            <p className="ls-dim py-8 text-center">
              <Typed text={run.phase === 'connecting' ? 'they are arriving ...' : 'thinking ...'} cap={700} />
            </p>
          );
        }
        const colour = colourOf(beat.turn.agentId);
        const speaker = run.participants.find((p) => p.id === beat.turn.agentId);
        const text = beat.turn.kind === 'silence' ? '(says nothing)' : beat.turn.text;
        return (
          <article className="mb-5 cursor-text" onClick={() => setTypedFor(beat.index)} title={lineDone ? undefined : 'press any key to finish the line'}>
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-[22px] uppercase leading-none" style={{ color: colour }}>{speaker?.name}</span>
              <span className="ls-dim text-[16px]">[{beat.turn.kind} D{beat.turn.depth} {beat.turn.minute}&prime;]</span>
            </p>
            <p className="mt-1 text-[24px] leading-tight">
              <span className="ls-dim">&gt; </span>
              <Typed key={beat.index} text={text} skip={lineDone} onDone={() => setTypedFor(beat.index)} />
            </p>
            {beat.turn.gesture && lineDone && <p className="ls-dim mt-1 text-[18px]">[{beat.turn.gesture}]</p>}
          </article>
        );
      })()}

      {/* the ask */}
      {asking && pendingListenerId && (
        <div className="ls-box mb-7" data-title="your read">
          <p className="mb-3">
            How did <span style={{ color: colourOf(pendingListenerId) }}>{nameOf(pendingListenerId)}</span> take that?
          </p>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {GUESSES.map(({ g, key, label }) => (
              <Btn key={g} hint={key} onClick={() => guess(g)}>{label}</Btn>
            ))}
          </div>
        </div>
      )}

      {/* the reveal */}
      {answered && answered.beat.record && (() => {
        const right = answered.guess === answered.actual;
        const tone = right ? 'var(--ls-ph)' : 'var(--ls-err)';
        return (
          <div className="ls-box mb-7" data-title={right ? 'OK' : 'ERR'} style={{ borderColor: tone, borderStyle: right ? 'solid' : 'dashed' }}>
            <p style={{ color: tone }}>{right ? 'you read that right' : 'you misread that'}</p>
            <p className="mt-1 leading-snug">
              {nameOf(answered.beat.record.agentId)} felt <span style={{ color: 'var(--ls-hi)' }}>{answered.beat.record.label}</span>
              {!right && <>, they actually {answered.actual === 'same' ? 'held about steady' : answered.actual === 'warmer' ? 'warmed up' : 'cooled off'}.</>}
            </p>
            <p className="ls-dim mt-2 leading-snug">
              {answered.beat.record.appraisal.note}
            </p>
            {Math.abs(answered.beat.record.responsivenessGap) > 0.05 && (
              <p className="ls-dim mt-2 text-[17px] leading-snug">
                and they misread it too: they took it{' '}
                {answered.beat.record.responsivenessGap < 0 ? 'colder' : 'warmer'} than it was meant
                ({answered.beat.record.responsivenessGap >= 0 ? '+' : ''}{answered.beat.record.responsivenessGap.toFixed(2)}).
              </p>
            )}
            <div className="mt-4">
              <Btn hint="enter" onClick={next}>
                {/* `done` is false while this reveal is still on screen, so the
                    end-of-date case has to be detected from the run, not from it. */}
                {run.canAdvance ? 'next line' : run.phase === 'finished' ? 'see how you did' : 'waiting for them ...'}
              </Btn>
            </div>
          </div>
        );
      })()}

      {watchOnly && run.canAdvance && !answered && lineDone && (
        <p className="ls-dim mb-7"><Typed text="watching ..." cap={500} /></p>
      )}

      {/* the reel */}
      {done && <Reel
        scores={scores}
        nameOf={nameOf}
        colourOf={colourOf}
        run={run}
        onAgain={() => { run.reset(); setScores([]); setAnswered(null); setTypedFor(null); }}
      />}

      {/* history */}
      {run.visible.length > 1 && (
        <details className="mt-8">
          <summary className="ls-dim uppercase tracking-[0.08em] text-[16px]">
            scrollback ({run.visible.length} lines)
          </summary>
          <ol className="mt-2 space-y-2 border-l-2 pl-3" style={{ borderColor: 'var(--ls-line)' }}>
            {run.visible.map((b) => (
              <li key={b.index} className="text-[18px] leading-snug">
                <span className="ls-dim">{String(b.turn.minute).padStart(3, ' ')}&prime; </span>
                <span className="uppercase" style={{ color: colourOf(b.turn.agentId) }}>
                  {run.participants.find((p) => p.id === b.turn.agentId)?.name}
                </span>
                <span className="ls-dim"> &gt; </span>
                {b.turn.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </Frame>
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
    <section className="ls-box mb-4" data-title="the evening ended">
      <p className="ls-dim">
        {run.ending?.reason} · {run.ending?.minutes} minutes · {run.ending?.turns} turns
      </p>

      {scores.length > 0 && (
        <>
          <p className="ls-title mt-5 text-[28px] sm:text-[36px]" style={{ color: 'var(--ls-hi)' }}>{pct}%</p>
          <p className="whitespace-pre text-[24px] leading-none" aria-hidden="true" style={{ color: 'var(--ls-hi)' }}>{bar(pct / 100, 20)}</p>
          <p className="mt-2">
            You read them right {correct} times out of {scores.length}.
          </p>

          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
            {[...byAgent.entries()].map(([id, e]) => (
              <p key={id}>
                <span className="uppercase" style={{ color: colourOf(id) }}>{nameOf(id)}</span>
                <span className="ls-dim"> </span>
                <span className="whitespace-pre" style={{ color: colourOf(id) }}>{bar(e.total ? e.correct / e.total : 0, 8)}</span>
                <span> {e.correct}/{e.total}</span>
              </p>
            ))}
          </div>

          {worst && (
            <div className="mt-6 border-l-2 border-dashed pl-4" style={{ borderColor: 'var(--ls-err)' }}>
              <Label className="mb-1" >where you misread them worst, minute {worst.beat.turn.minute}</Label>
              <p className="leading-snug">&gt; {worst.beat.turn.text}</p>
              <p className="ls-dim mt-1 leading-snug">
                {nameOf(worst.agentId)} moved {worst.delta >= 0 ? 'up' : 'down'} {Math.abs(worst.delta).toFixed(2)} on that line.
                What did you miss?
              </p>
            </div>
          )}
        </>
      )}

      {run.debrief && (
        <div className="mt-7 border-t-2 border-dashed pt-5" style={{ borderColor: 'var(--ls-line)' }}>
          <h3 className="ls-title mb-3 text-[11px]">WHAT HAPPENED BETWEEN THEM</h3>
          <ol className="space-y-2">
            {run.debrief.moments.map((m) => (
              <li key={`${m.kind}-${m.turn}`} className="leading-snug">
                <p><span className="ls-dim">{m.minute}&prime; </span><span style={{ color: 'var(--ls-hi)' }}>{m.label}</span></p>
                <p className="ls-dim">&gt; {m.excerpt.slice(0, 130)}{m.excerpt.length > 130 ? ' ...' : ''}</p>
              </li>
            ))}
          </ol>
          {run.debrief.sharedInterests.length > 0 && (
            <p className="mt-4">
              They both kept coming back to{' '}
              <span style={{ color: 'var(--ls-hi)' }}>{run.debrief.sharedInterests.map((s) => s.topic).slice(0, 3).join(', ')}</span>.
            </p>
          )}
        </div>
      )}

      <div className="mt-7 flex flex-wrap gap-x-3 gap-y-1">
        <Btn big onClick={onAgain}>another date</Btn>
        <Link href="/lovesims/date" className="ls-btn ls-big">analyst view</Link>
      </div>
    </section>
  );
}
