'use client';

/**
 * Setup → live date → debrief, in one route.
 *
 * The framing rule from the brief: this surface reports what happened and asks
 * questions about it. It does not emit a compatibility score, because the best
 * available evidence says relationship variance is not predictable from
 * pre-meeting data, so a number here would be a claim the research does not support.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AffectTrack, CHANNEL_COLOURS } from '@/components/lovesims/affect-track';
import { Btn, Frame, Label, Typed } from '@/components/lovesims/terminal';
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

/* useSearchParams needs a Suspense boundary above it when the page is prerendered. */
export default function DatePage() {
  return (
    <Suspense fallback={null}>
      <Analyst />
    </Suspense>
  );
}

function Analyst() {
  // ?demo=1 runs on the deterministic mock provider with a short date, like the game's: no model call, nothing spent.
  const demo = useSearchParams().get('demo') === '1';
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
        body: JSON.stringify({ agentAId: agentA, agentBId: agentB, sceneId, maxTurns: demo ? Math.min(maxTurns, 8) : maxTurns, live: demo ? false : live }),
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
    return <Shell><p className="ls-dim">{error ? <>ERR {error}</> : <Typed text="loading cast ..." cap={600} />}</p></Shell>;
  }

  const sceneMeta = catalog.scenes.find((s) => s.id === sceneId);
  const status = demo
    ? 'demo: stand-in provider, 8 turns'
    : !live
    ? 'model offline: stand-in provider'
    : catalog.remaining === null ? 'unlocked' : `free dates: ${catalog.remaining}`;

  return (
    <Shell status={status}>
      {/* ---------- setup ---------- */}
      <section className="ls-box mb-10" data-title="setup">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.4fr]">
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
          <p className="ls-dim mt-3 max-w-3xl text-[17px] leading-snug">
            {sceneMeta.description}{' '}
            <span>
              [{sceneMeta.timeBudget} min budget · noise {sceneMeta.noise.toFixed(2)}]
            </span>
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-end gap-6 border-t-2 border-dashed pt-4" style={{ borderColor: 'var(--ls-line)' }}>
          <Field label={`turn ceiling: ${maxTurns}`}>
            <input type="range" min={6} max={22} value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} className="w-44" />
          </Field>

          <span className="ls-dim text-[17px]">
            {demo
              ? 'demo mode: the stand-in provider, 8 turns, no model call'
              : !live
              ? 'the model is not connected, so this runs on the stand-in provider'
              : catalog.remaining === null
                ? 'live models'
                : catalog.remaining === 0
                  ? 'the free dates are used up; the password opens more'
                  : `live models, ${catalog.remaining} free ${catalog.remaining === 1 ? 'date' : 'dates'} left`}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {phase === 'running' ? <Btn onClick={stop}>stop</Btn> : null}
            <Btn big onClick={run} disabled={phase === 'running' || agentA === agentB}>
              {phase === 'running' ? 'running ...' : phase === 'done' ? 'run again' : 'run the date'}
            </Btn>
          </div>
        </div>

        {agentA === agentB && <p className="mt-3" style={{ color: 'var(--ls-err)' }}>ERR pick two different people.</p>}
        {error && <p className="mt-3" style={{ color: 'var(--ls-err)' }}>ERR {error}</p>}
        <p className="ls-dim mt-3 text-[17px]">
          {catalog.agents.length} people in the cast, all invented for this demo
        </p>
      </section>

      {/* ---------- live ---------- */}
      {participants.length > 0 && (
        <>
          <div className="mb-5 flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <h2 className="ls-title text-[12px]">{scene?.name.toUpperCase()}</h2>
            <span className="ls-dim">{scene?.place}, {scene?.city}</span>
            <span className="ml-auto"><Btn onClick={() => setRevealGoals((v) => !v)} on={revealGoals}>{revealGoals ? 'hide private goals' : 'reveal private goals'}</Btn></span>
          </div>

          {revealGoals && (
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              {participants.map((p) => (
                <div key={p.id} className="ls-box" data-title={p.name} style={{ borderColor: colourOf(p.id) }}>
                  <dl className="space-y-1 text-[18px] leading-snug">
                    <div><dt className="ls-dim inline">wants: </dt><dd className="inline">{p.goals.overt}</dd></div>
                    <div><dt className="ls-dim inline">carrying: </dt><dd className="inline">{p.goals.covert}</dd></div>
                    <div><dt className="ls-dim inline">secret (D4 only): </dt><dd className="inline">{p.goals.secret}</dd></div>
                    <div><dt className="ls-dim inline">constraint: </dt><dd className="inline">{p.goals.constraint}</dd></div>
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

          <section className="ls-box mb-8" data-title="transcript">
            <div className="space-y-4">
              {turns.map((t, i) => {
                const rec = records.find((r) => r.turn === t.index);
                const evs = sceneEvents.filter((s) => s.afterTurn === i);
                return (
                  <div key={t.index}>
                    {evs.map((e, j) => (
                      <p key={j} className="ls-dim mb-3">
                        <span style={{ color: 'var(--ls-hi)' }}>** </span>[{e.minute}m] {e.text}
                      </p>
                    ))}
                    <TurnRow turn={t} record={rec} name={names[t.agentId]} colour={colourOf(t.agentId)} partnerName={names[agentIds.find((x) => x !== t.agentId) ?? '']} />
                  </div>
                );
              })}
              {phase === 'running' && (
                <p className="ls-dim">
                  <Typed key={turns.length} text={turns.length === 0 ? 'setting the scene ...' : 'thinking ...'} cap={700} />
                </p>
              )}
            </div>
            <div ref={streamEndRef} />
          </section>

          {ending && (
            <p className="ls-dim mb-8">
              &gt; end: {ending.reason} · {ending.minutes} minutes · {ending.turns} turns
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
    <article>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="ls-dim tabular-nums">{String(turn.minute).padStart(3, '\u00a0')}m</span>
        <span className="uppercase" style={{ color: colour }}>{name}</span>
        <span className="ls-dim text-[16px]">
          [{turn.kind} D{turn.depth}{turn.initiatedTopic ? ' new-topic' : ''} {turn.topic}]
        </span>
      </div>

      <p className="mt-0.5 text-[21px] leading-snug">
        <span className="ls-dim">&gt; </span>
        {turn.kind === 'silence' ? <span className="ls-dim">(says nothing)</span> : turn.text}
      </p>
      {turn.gesture && <p className="ls-dim mt-0.5 text-[17px]">[{turn.gesture}]</p>}

      {record && (
        <p className="ls-dim mt-1 text-[16px] leading-snug">
          -&gt; {partnerName} felt <span style={{ color: 'var(--ls-hi)' }}>{record.label}</span>
          {' · '}mood {record.mood.valence >= 0 ? '+' : ''}{record.mood.valence.toFixed(2)}
          {' · '}intimacy {record.intimacy.toFixed(2)}
          {' · '}read it {record.responsivenessGap < -0.02 ? 'colder' : record.responsivenessGap > 0.02 ? 'warmer' : 'as it was'}
          {Math.abs(record.responsivenessGap) > 0.02 && ` (${record.responsivenessGap >= 0 ? '+' : ''}${record.responsivenessGap.toFixed(2)})`}
          {', '}<span>{record.appraisal.note}</span>
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
    <section className="mb-10">
      <h2 className="ls-title mb-3 text-[13px]">DEBRIEF</h2>
      <p className="ls-dim mb-6 max-w-2xl text-[17px] leading-snug">
        Everything below is computed from the turn log and the per-turn affect records. There is no
        compatibility score here on purpose, that is the one claim this kind of simulation cannot support.
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="mb-8 border-l-2 border-dashed pl-4" style={{ borderColor: 'var(--ls-err)' }}>
          <Label className="mb-1">the responsiveness gap</Label>
          <p className="leading-snug">
            {gapper.name} consistently read the other person as{' '}
            <span style={{ color: 'var(--ls-hi)' }}>{gapper.responsivenessGap < 0 ? 'less' : 'more'} responsive than they were being</span>
            {' '}(mean {gapper.responsivenessGap.toFixed(2)} across the date). What would have to be true for
            the other reading to be the right one?
          </p>
        </div>
      )}

      <div className="mb-8 overflow-x-auto">
        <table className="ls-table min-w-[720px] text-[18px]">
          <thead>
            <tr>
              {['', 'turns', 'words', 'asked', 'drove', 'built on', 'deepest', 'gave', 'got', 'repairs', 'gap', 'ended at', 'move variety', 'safe moves'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.perAgent.map((m) => (
              <tr key={m.agentId}>
                <td className="uppercase" style={{ color: colourOf(m.agentId) }}>{m.name}</td>
                <td className="">{m.turns}</td>
                <td className="">{m.meanTurnWords}</td>
                <td className="">{(m.questionRatio * 100).toFixed(0)}%</td>
                <td className="">{(m.topicInitiative * 100).toFixed(0)}%</td>
                <td className="">{(m.uptakeRate * 100).toFixed(0)}%</td>
                <td className="">D{m.deepestDepth}</td>
                <td className="">{m.disclosureGiven}</td>
                <td className="">{m.disclosureReceived}</td>
                <td className="">{m.repairAttempts}</td>
                <td className="">{m.responsivenessGap >= 0 ? '+' : ''}{m.responsivenessGap.toFixed(2)}</td>
                <td className="">{m.finalMoodValence >= 0 ? '+' : ''}{m.finalMoodValence.toFixed(2)}</td>
                <td className="">{m.kindEntropy.toFixed(2)}</td>
                <td className="" style={m.safeMoveRatio > 0.8 ? { color: 'var(--ls-err)' } : undefined}>
                  {(m.safeMoveRatio * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="ls-title mb-2 text-[11px]">READING EACH OTHER</h3>
      <p className="ls-dim mb-3 max-w-2xl text-[17px] leading-snug">
        Before each turn, each of them privately predicted what the other would do next, the move,
        how much they would put on the table, whether they would ask something back. Accuracy on its
        own mostly measures how predictable the other person was, so what is worth reading is{' '}
<span style={{ color: 'var(--ls-hi)' }}>skill</span>: how much better they did than a naive forecaster who just guesses whatever
        that partner has done most often so far. Zero means the read added nothing.
      </p>
      <div className="mb-8 overflow-x-auto">
        <table className="ls-table min-w-[560px] text-[18px]">
          <thead>
            <tr>
              {['', 'called', 'called the move', 'depth error', 'accuracy', 'naive guess', 'skill'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.perAgent.map((m) => (
              <tr key={m.agentId}>
                <td className="uppercase" style={{ color: colourOf(m.agentId) }}>{m.name}</td>
                <td className="">{m.anticipation.forecasts}</td>
                <td className="">{(m.anticipation.kindAccuracy * 100).toFixed(0)}%</td>
                <td className="">{m.anticipation.depthMae.toFixed(2)}</td>
                <td className="">{m.anticipation.composite.toFixed(3)}</td>
                <td className="ls-dim">{m.anticipation.causalBaseline.toFixed(3)}</td>
                <td
                  className=""
                  style={{ color: m.anticipation.causalSkill >= 0 ? colourOf(m.agentId) : 'var(--ls-dim)' }}
                >
                  {m.anticipation.causalSkill >= 0 ? '+' : ''}{m.anticipation.causalSkill.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="ls-title mb-3 text-[11px]">THE MOMENTS THAT MATTERED</h3>
      <ol className="mb-8 space-y-3 border-l-2 pl-4" style={{ borderColor: 'var(--ls-line)' }}>
        {d.moments.map((m) => (
          <li key={`${m.kind}-${m.turn}`}>
            <p><span className="ls-dim tabular-nums">{m.minute}m </span><span style={{ color: 'var(--ls-hi)' }}>{m.label}</span></p>
            <p className="leading-snug">&gt; {m.excerpt}</p>
            <p className="ls-dim text-[16px] leading-snug">{m.evidence}</p>
          </li>
        ))}
        {d.moments.length === 0 && <li className="ls-dim">Nothing crossed the threshold, a flat date.</li>}
      </ol>

      <h3 className="ls-title mb-2 text-[11px]">SHARED GROUND</h3>
      <p className="ls-dim mb-3 max-w-2xl text-[17px] leading-snug">
        Topics both of them engaged with, with the turns cited. This is the input to a real-world
        suggestion, the recommendation has to point at evidence, not at a vibe.
      </p>
      <ul className="space-y-1">
        {d.sharedInterests.map((s) => (
          <li key={s.topic} className="flex flex-wrap items-baseline gap-x-3">
            <span style={{ color: 'var(--ls-hi)' }}>{s.topic}</span>
            <span className="ls-dim text-[16px]">
              {s.turns.length} turns · longest unbroken run {s.sustainedTurns} · turns {s.turns.join(', ')}
            </span>
          </li>
        ))}
        {d.sharedInterests.length === 0 && <li className="ls-dim">They never sustained a topic together.</li>}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Shell({ children, status }: { children: React.ReactNode; status?: string }) {
  return (
    <Frame wide status={status}>
      <header className="mb-8">
        <h1 className="ls-title text-[13px] leading-[1.8] sm:text-[15px]">WATCH TWO PEOPLE FAIL TO SAY WHAT THEY MEAN</h1>
        <p className="ls-dim mt-3 max-w-2xl leading-snug">
          Two invented people, each with a mood, a disclosure ladder, private goals, and a secret.
          The affect track under the transcript is state the engine wrote while it ran, not a summary written afterwards.
        </p>
      </header>
      {children}
    </Frame>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="ls-dim mb-1 block text-[16px] uppercase tracking-[0.08em]">&gt; {label}</span>
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
      className="ls-select"
      style={accent ? { borderLeftWidth: 6, borderLeftColor: accent } : undefined}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="ls-box">
      <p className="ls-dim text-[16px] uppercase tracking-[0.08em]">{label}</p>
      <p className="ls-title mt-2 text-[16px]" style={{ color: 'var(--ls-hi)' }}>{value}</p>
      <p className="ls-dim mt-2 text-[16px] leading-snug">{note}</p>
    </div>
  );
}
