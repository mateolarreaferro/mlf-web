'use client';

/**
 * Setup → live date → debrief, in one route.
 *
 * The framing rule from the brief: this surface reports what happened and asks
 * questions about it. It does not emit a compatibility score, because the best
 * available evidence says relationship variance is not predictable from
 * pre-meeting data, so a number here would be a claim the research does not support.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AffectTrack, CHANNEL_COLOURS } from '@/components/lovesims/affect-track';
import type { AffectRecord, DateEvent, Debrief, PrivateGoals, Turn } from '@/lib/lovesims/types';

interface AgentSummary {
  id: string; name: string; age: number | null; gender: string; blurb: string; memoryCount: number;
}
interface SceneSummary {
  id: string; name: string; place: string; city: string; description: string; timeBudget: number; noise: number;
}
interface Catalog {
  agents: AgentSummary[]; scenes: SceneSummary[]; tier0: boolean; liveAvailable: boolean; remaining: number | null;
}

type Phase = 'setup' | 'running' | 'done';

export default function DatePage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [phase, setPhase] = useState<Phase>('setup');
  const [error, setError] = useState<string | null>(null);

  const [agentA, setAgentA] = useState('tomas');
  const [agentB, setAgentB] = useState('ingrid');
  const [sceneId, setSceneId] = useState('jazz-bar');
  const [maxTurns, setMaxTurns] = useState(22);
  const [live, setLive] = useState(true);

  const [scene, setScene] = useState<SceneSummary | null>(null);
  const [participants, setParticipants] = useState<{ id: string; name: string; goals: PrivateGoals }[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [records, setRecords] = useState<AffectRecord[]>([]);
  const [sceneEvents, setSceneEvents] = useState<{ afterTurn: number; minute: number; text: string }[]>([]);
  const [ending, setEnding] = useState<{ reason: string; minutes: number; turns: number } | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [revealGoals, setRevealGoals] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const streamEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/lovesims/agents')
      .then((r) => r.json())
      .then((c: Catalog) => {
        setCatalog(c);
        setLive(c.liveAvailable);
      })
      .catch(() => setError('could not load the agent catalog'));
  }, []);

  useEffect(() => {
    if (phase === 'running') streamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, phase]);

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of participants) m[p.id] = p.name;
    return m;
  }, [participants]);

  const agentIds = useMemo(() => participants.map((p) => p.id), [participants]);
  const colourOf = useCallback(
    (id: string) => CHANNEL_COLOURS[Math.max(0, agentIds.indexOf(id)) % 2],
    [agentIds],
  );

  async function run() {
    setPhase('running');
    setError(null);
    setTurns([]); setRecords([]); setSceneEvents([]); setEnding(null); setDebrief(null);
    setParticipants([]); setRevealGoals(false);

    const controller = new AbortController();
    abortRef.current = controller;

    let res: Response;
    try {
      res = await fetch('/api/lovesims/date', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentAId: agentA, agentBId: agentB, sceneId, maxTurns, live }),
        signal: controller.signal,
      });
    } catch {
      setError('could not reach the simulation'); setPhase('setup'); return;
    }
    if (!res.ok || !res.body) {
      const msg = await res.json().catch(() => ({ error: 'the simulation refused to start' }));
      setError(msg.error ?? 'the simulation refused to start'); setPhase('setup'); return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let turnCount = 0;

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
              setScene({
                id: ev.scene.id, name: ev.scene.name, place: ev.scene.place, city: ev.scene.city,
                description: ev.scene.description, timeBudget: ev.scene.timeBudget, noise: ev.scene.sensory.noise,
              });
              setParticipants(ev.agents);
              break;
            case 'turn': turnCount++; setTurns((t) => [...t, ev.turn]); break;
            case 'affect': setRecords((r) => [...r, ev.record]); break;
            case 'scene_event':
              setSceneEvents((s) => [...s, { afterTurn: turnCount, minute: ev.minute, text: ev.text }]);
              break;
            case 'end': setEnding({ reason: ev.reason, minutes: ev.minutes, turns: ev.turns }); break;
            case 'debrief': setDebrief(ev.debrief); break;
            case 'error': setError(ev.message); break;
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    }
    setPhase('done');
  }

  function stop() {
    abortRef.current?.abort();
    setPhase('done');
  }

  if (!catalog) {
    return <Shell><p className="font-mono text-sm text-neutral-500">{error ?? 'loading agent bank…'}</p></Shell>;
  }

  const sceneMeta = catalog.scenes.find((s) => s.id === sceneId);

  return (
    <Shell>
      {/* ---------- setup ---------- */}
      <section className="mb-10 rounded-lg border border-neutral-200 bg-white p-5">
        <div className="grid gap-5 md:grid-cols-[1fr_1fr_1.4fr]">
          <Field label="First agent">
            <Select value={agentA} onChange={setAgentA} options={catalog.agents.map((a) => ({ value: a.id, label: `${a.name}${a.age ? `, ${a.age}` : ''}` }))} accent={CHANNEL_COLOURS[0]} />
          </Field>
          <Field label="Second agent">
            <Select value={agentB} onChange={setAgentB} options={catalog.agents.map((a) => ({ value: a.id, label: `${a.name}${a.age ? `, ${a.age}` : ''}` }))} accent={CHANNEL_COLOURS[1]} />
          </Field>
          <Field label="Scene">
            <Select value={sceneId} onChange={setSceneId} options={catalog.scenes.map((s) => ({ value: s.id, label: `${s.name}, ${s.place}` }))} />
          </Field>
        </div>

        {sceneMeta && (
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-neutral-600">
            {sceneMeta.description}{' '}
            <span className="font-mono text-[11px] text-neutral-400">
              {sceneMeta.timeBudget} min budget · noise {sceneMeta.noise.toFixed(2)}
            </span>
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-end gap-6 border-t border-neutral-100 pt-4">
          <Field label={`Turn ceiling, ${maxTurns}`}>
            <input type="range" min={6} max={22} value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} className="w-44 accent-neutral-800" />
          </Field>

          <span className="font-mono text-[11px] text-neutral-400">
            {!live
              ? 'the model is not connected, so this runs on the stand-in provider'
              : catalog.remaining === null
                ? 'live models'
                : catalog.remaining === 0
                  ? 'the free dates are used up; the password opens more'
                  : `live models, ${catalog.remaining} free ${catalog.remaining === 1 ? 'date' : 'dates'} left`}
          </span>

          <div className="ml-auto flex items-center gap-3">
            {phase === 'running' ? (
              <button onClick={stop} className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Stop</button>
            ) : null}
            <button
              onClick={run}
              disabled={phase === 'running' || agentA === agentB}
              className="rounded bg-neutral-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {phase === 'running' ? 'Running…' : phase === 'done' ? 'Run again' : 'Run the date'}
            </button>
          </div>
        </div>

        {agentA === agentB && <p className="mt-3 font-mono text-[11px] text-[#a3324e]">Pick two different agents.</p>}
        {error && <p className="mt-3 font-mono text-[11px] text-[#a3324e]">{error}</p>}
        <p className="mt-3 font-mono text-[11px] text-neutral-400">
          {catalog.agents.length} people in the cast, all invented for this demo
        </p>
      </section>

      {/* ---------- live ---------- */}
      {participants.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <h2 className="font-serif text-2xl">{scene?.name}</h2>
            <span className="font-mono text-[11px] text-neutral-500">{scene?.place}, {scene?.city}</span>
            <button onClick={() => setRevealGoals((v) => !v)} className="ml-auto font-mono text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-900">
              {revealGoals ? 'hide private goals' : 'reveal private goals'}
            </button>
          </div>

          {revealGoals && (
            <div className="mb-6 grid gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 md:grid-cols-2">
              {participants.map((p) => (
                <div key={p.id} className="bg-white p-4">
                  <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.13em]" style={{ color: colourOf(p.id) }}>{p.name}</h3>
                  <dl className="space-y-1.5 text-sm text-neutral-600">
                    <div><dt className="inline font-medium text-neutral-900">Wants: </dt><dd className="inline">{p.goals.overt}</dd></div>
                    <div><dt className="inline font-medium text-neutral-900">Carrying: </dt><dd className="inline">{p.goals.covert}</dd></div>
                    <div><dt className="inline font-medium text-neutral-900">Secret (D4 only): </dt><dd className="inline">{p.goals.secret}</dd></div>
                    <div><dt className="inline font-medium text-neutral-900">Constraint: </dt><dd className="inline">{p.goals.constraint}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
          )}

          {records.length > 1 && (
            <div className="mb-6">
              <AffectTrack records={records} agentIds={agentIds} names={names} moments={debrief?.moments ?? []} timeBudget={scene?.timeBudget ?? 90} />
            </div>
          )}

          <section className="mb-8 rounded-lg border border-neutral-200 bg-white">
            <div className="divide-y divide-neutral-100">
              {turns.map((t, i) => {
                const rec = records.find((r) => r.turn === t.index);
                const evs = sceneEvents.filter((s) => s.afterTurn === i);
                return (
                  <div key={t.index}>
                    {evs.map((e, j) => (
                      <p key={j} className="bg-neutral-50 px-4 py-2 text-center font-mono text-[11px] text-neutral-500">
                        [{e.minute}m] {e.text}
                      </p>
                    ))}
                    <TurnRow turn={t} record={rec} name={names[t.agentId]} colour={colourOf(t.agentId)} partnerName={names[agentIds.find((x) => x !== t.agentId) ?? '']} />
                  </div>
                );
              })}
              {phase === 'running' && (
                <p className="px-4 py-3 font-mono text-[11px] text-neutral-400">
                  {turns.length === 0 ? 'setting the scene…' : 'thinking…'}
                </p>
              )}
            </div>
            <div ref={streamEndRef} />
          </section>

          {ending && (
            <p className="mb-8 font-mono text-[11px] text-neutral-500">
             , end, {ending.reason} · {ending.minutes} minutes · {ending.turns} turns
            </p>
          )}
        </>
      )}

      {debrief && <DebriefView debrief={debrief} colourOf={colourOf} />}
    </Shell>
  );
}

// ---------------------------------------------------------------------------

function TurnRow({ turn, record, name, colour, partnerName }: {
  turn: Turn; record?: AffectRecord; name: string; colour: string; partnerName: string;
}) {
  return (
    <article className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] text-neutral-400 tabular-nums">{String(turn.minute).padStart(3)}m</span>
        <span className="text-sm font-semibold" style={{ color: colour }}>{name}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-400">
          {turn.kind} · D{turn.depth}{turn.initiatedTopic ? ' · new topic' : ''} · {turn.topic}
        </span>
      </div>

      <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-800">
        {turn.kind === 'silence' ? <span className="italic text-neutral-400">(says nothing)</span> : turn.text}
      </p>
      {turn.gesture && <p className="mt-1 text-sm italic text-neutral-500">[{turn.gesture}]</p>}

      {record && (
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-neutral-400">
          → {partnerName} felt <span className="text-neutral-600">{record.label}</span>
          {' · '}mood {record.mood.valence >= 0 ? '+' : ''}{record.mood.valence.toFixed(2)}
          {' · '}intimacy {record.intimacy.toFixed(2)}
          {' · '}read it {record.responsivenessGap < -0.02 ? 'colder' : record.responsivenessGap > 0.02 ? 'warmer' : 'as it was'}
          {Math.abs(record.responsivenessGap) > 0.02 && ` (${record.responsivenessGap >= 0 ? '+' : ''}${record.responsivenessGap.toFixed(2)})`}
          {', '}<span className="italic">{record.appraisal.note}</span>
        </p>
      )}
    </article>
  );
}

function DebriefView({ debrief, colourOf }: {
  debrief: Debrief; colourOf: (id: string) => string;
}) {
  const d = debrief;
  const gapper = [...d.perAgent].sort((a, b) => Math.abs(b.responsivenessGap) - Math.abs(a.responsivenessGap))[0];

  return (
    <section className="mb-16">
      <h2 className="mb-1 font-serif text-3xl">Debrief</h2>
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-neutral-600">
        Everything below is computed from the turn log and the per-turn affect records. There is no
        compatibility score here on purpose, that is the one claim this kind of simulation cannot support.
      </p>

      <div className="mb-8 grid gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Language style matching" value={d.lsm.toFixed(3)} note="function-word synchrony; validated speed-dating predictor" />
        <Stat label="Disclosure reciprocity" value={d.reciprocityIndex.toFixed(3)} note="1.0 = perfectly balanced" />
        <Stat label="Dead air" value={String(d.deadAirEvents)} note="turns neither of them wanted" />
        <Stat
          label="Both want a second"
          value={`${d.mutualInterestMargin >= 0 ? '+' : ''}${d.mutualInterestMargin.toFixed(2)}`}
          note={`${d.mutualInterest ? 'all six conditions cleared' : 'held back by'} ${d.mutualInterestBinding.toLowerCase()}`}
        />
      </div>

      {gapper && Math.abs(gapper.responsivenessGap) > 0.03 && (
        <div className="mb-8 rounded border-l-2 border-[#a3324e] bg-[#a3324e]/5 px-5 py-4">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a3324e]">The responsiveness gap</p>
          <p className="text-sm leading-relaxed text-neutral-700">
            {gapper.name} consistently read the other person as{' '}
            <strong>{gapper.responsivenessGap < 0 ? 'less' : 'more'} responsive than they were being</strong>
            {' '}(mean {gapper.responsivenessGap.toFixed(2)} across the date). What would have to be true for
            the other reading to be the right one?
          </p>
        </div>
      )}

      <div className="mb-8 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-400">
              {['', 'turns', 'words', 'asked', 'drove', 'built on', 'deepest', 'gave', 'got', 'repairs', 'gap', 'ended at', 'move variety', 'safe moves'].map((h) => (
                <th key={h} className="px-3 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.perAgent.map((m) => (
              <tr key={m.agentId} className="border-b border-neutral-100 last:border-0">
                <td className="px-3 py-2.5 font-semibold" style={{ color: colourOf(m.agentId) }}>{m.name}</td>
                <td className="px-3 py-2.5 tabular-nums">{m.turns}</td>
                <td className="px-3 py-2.5 tabular-nums">{m.meanTurnWords}</td>
                <td className="px-3 py-2.5 tabular-nums">{(m.questionRatio * 100).toFixed(0)}%</td>
                <td className="px-3 py-2.5 tabular-nums">{(m.topicInitiative * 100).toFixed(0)}%</td>
                <td className="px-3 py-2.5 tabular-nums">{(m.uptakeRate * 100).toFixed(0)}%</td>
                <td className="px-3 py-2.5 tabular-nums">D{m.deepestDepth}</td>
                <td className="px-3 py-2.5 tabular-nums">{m.disclosureGiven}</td>
                <td className="px-3 py-2.5 tabular-nums">{m.disclosureReceived}</td>
                <td className="px-3 py-2.5 tabular-nums">{m.repairAttempts}</td>
                <td className="px-3 py-2.5 tabular-nums">{m.responsivenessGap >= 0 ? '+' : ''}{m.responsivenessGap.toFixed(2)}</td>
                <td className="px-3 py-2.5 tabular-nums">{m.finalMoodValence >= 0 ? '+' : ''}{m.finalMoodValence.toFixed(2)}</td>
                <td className="px-3 py-2.5 tabular-nums">{m.kindEntropy.toFixed(2)}</td>
                <td className="px-3 py-2.5 tabular-nums" style={m.safeMoveRatio > 0.8 ? { color: '#a3324e' } : undefined}>
                  {(m.safeMoveRatio * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-1 font-serif text-xl">Reading each other</h3>
      <p className="mb-3 max-w-2xl text-sm leading-relaxed text-neutral-600">
        Before each turn, each of them privately predicted what the other would do next, the move,
        how much they would put on the table, whether they would ask something back. Accuracy on its
        own mostly measures how predictable the other person was, so what is worth reading is{' '}
        <em>skill</em>: how much better they did than a naive forecaster who just guesses whatever
        that partner has done most often so far. Zero means the read added nothing.
      </p>
      <div className="mb-8 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-400">
              {['', 'called', 'called the move', 'depth error', 'accuracy', 'naive guess', 'skill'].map((h) => (
                <th key={h} className="px-3 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.perAgent.map((m) => (
              <tr key={m.agentId} className="border-b border-neutral-100 last:border-0">
                <td className="px-3 py-2.5 font-semibold" style={{ color: colourOf(m.agentId) }}>{m.name}</td>
                <td className="px-3 py-2.5 tabular-nums">{m.anticipation.forecasts}</td>
                <td className="px-3 py-2.5 tabular-nums">{(m.anticipation.kindAccuracy * 100).toFixed(0)}%</td>
                <td className="px-3 py-2.5 tabular-nums">{m.anticipation.depthMae.toFixed(2)}</td>
                <td className="px-3 py-2.5 tabular-nums">{m.anticipation.composite.toFixed(3)}</td>
                <td className="px-3 py-2.5 tabular-nums text-neutral-500">{m.anticipation.causalBaseline.toFixed(3)}</td>
                <td
                  className="px-3 py-2.5 font-semibold tabular-nums"
                  style={{ color: m.anticipation.causalSkill >= 0 ? colourOf(m.agentId) : '#8a8a8a' }}
                >
                  {m.anticipation.causalSkill >= 0 ? '+' : ''}{m.anticipation.causalSkill.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-3 font-serif text-xl">The moments that mattered</h3>
      <ol className="mb-8 space-y-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        {d.moments.map((m) => (
          <li key={`${m.kind}-${m.turn}`} className="bg-white px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono text-[11px] text-neutral-400 tabular-nums">{m.minute}m</span>
              <span className="text-sm font-semibold text-neutral-900">{m.label}</span>
            </div>
            <p className="mt-1 text-sm italic leading-relaxed text-neutral-700">&ldquo;{m.excerpt}&rdquo;</p>
            <p className="mt-1 font-mono text-[10px] text-neutral-400">{m.evidence}</p>
          </li>
        ))}
        {d.moments.length === 0 && <li className="bg-white px-4 py-3 text-sm text-neutral-500">Nothing crossed the threshold, a flat date.</li>}
      </ol>

      <h3 className="mb-1 font-serif text-xl">Shared ground</h3>
      <p className="mb-3 max-w-2xl text-sm text-neutral-600">
        Topics both of them engaged with, with the turns cited. This is the input to a real-world
        suggestion, the recommendation has to point at evidence, not at a vibe.
      </p>
      <ul className="space-y-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        {d.sharedInterests.map((s) => (
          <li key={s.topic} className="flex flex-wrap items-baseline gap-x-3 bg-white px-4 py-2.5">
            <span className="text-sm font-medium text-neutral-900">{s.topic}</span>
            <span className="font-mono text-[11px] text-neutral-400">
              {s.turns.length} turns · longest unbroken run {s.sustainedTurns} · turns {s.turns.join(', ')}
            </span>
          </li>
        ))}
        {d.sharedInterests.length === 0 && <li className="bg-white px-4 py-2.5 text-sm text-neutral-500">They never sustained a topic together.</li>}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl py-6 sm:py-10">
      <header className="mb-8 border-b border-neutral-200 pb-6">
        <p className="mb-3 flex flex-wrap items-baseline gap-x-5 font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-400">
          <Link href="/lovesims" className="hover:text-neutral-700">LoveSims <span className="text-[#a3324e]">v2</span> · simulated date</Link>
          <Link href="/lovesims/play" className="normal-case tracking-normal underline underline-offset-2 hover:text-neutral-700">play</Link>
          <Link href="/?project=love-simulations" className="normal-case tracking-normal underline underline-offset-2 hover:text-neutral-700">mateolarreaferro.com</Link>
        </p>
        <h1 className="font-serif text-4xl leading-tight">Watch two people fail to say what they mean</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-neutral-600">
          Two invented people, each with a mood, a disclosure ladder, private goals, and a secret.
          The affect track under the transcript is state the engine wrote while it ran, not a summary written afterwards.
        </p>
      </header>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.13em] text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options, accent }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; accent?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
      style={accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-white p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-400">{label}</p>
      <p className="mt-1 font-serif text-2xl tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-neutral-500">{note}</p>
    </div>
  );
}
