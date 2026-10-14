/**
 * The date engine.
 *
 * One turn is:
 *   director allocates the floor  →  voice model produces a turn  →  code clamps
 *   its depth to the ceiling  →  both disclosure ledgers update  →  analyst model
 *   appraises it for the listener  →  code maps appraisal to PAD, applies
 *   attachment, steps mood and gates  →  the record is emitted.
 *
 * Every psychological claim in the debrief comes from state written on this path.
 * Nothing is reconstructed afterwards by asking a model what it thinks happened.
 */

import { computeGates, initialAffect, stepAffect } from './affect';
import { loadAgent } from './agentbank';
import { allocateFloor, checkEnd, minutesForTurn } from './director';
import {
  initialDisclosure,
  meanResponsiveness,
  perceiveResponsiveness,
  recordDisclosure,
  responsivenessGap,
  stepDisclosure,
} from './disclosure';
import { makeProvider, type Provider } from './llm';
import { ageTraces, emptyRelational, retrieve } from './memory';
import { buildDebrief, scoreForecast } from './metrics';
import {
  appraisalSchema,
  appraisalSystem,
  appraisalUser,
  identitySystem,
  relationalSchema,
  relationalSystem,
  relationalUser,
  turnSchema,
  turnUser,
  type AppraisalOutput,
  type RelationalOutput,
  type TurnOutput,
} from './prompts';
import { getScene, makeRng, scheduleEvents } from './scene';
import type {
  AffectRecord,
  Appraisal,
  DateAgent,
  DateConfig,
  DateEvent,
  DisclosureDepth,
  ForecastScore,
  Turn,
} from './types';

const RELATIONAL_EVERY = 8;
const RECENT_WINDOW = 12;

/**
 * One extra attempt above whatever the SDK already retried. A date is a long
 * sequential process with real cost sunk into it; throwing away eighteen turns
 * because one request failed after the transport gave up is the wrong trade.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (first) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      return await fn();
    } catch {
      throw new Error(`${label}: ${(first as Error).message}`);
    }
  }
}

function makeDateAgent(id: string, seed: number): DateAgent {
  const { identity, goals, traces } = loadAgent(id, seed);
  return {
    identity,
    goals,
    traces,
    affect: initialAffect(),
    disclosure: initialDisclosure(),
    relational: emptyRelational(),
    pendingForecast: null,
    lastSpokeAt: -1,
    priorDates: 0,
  };
}

export async function* runDate(config: DateConfig, provider?: Provider): AsyncGenerator<DateEvent> {
  const llm = provider ?? makeProvider(config.live);
  const scene = getScene(config.sceneId);
  const rng = makeRng(config.seed);

  const a = makeDateAgent(config.agentAId, config.seed);
  const b = makeDateAgent(config.agentBId, config.seed + 1);

  // Set initial gates now that we know the scene.
  a.affect.gates = computeGates(a.affect, a.identity.selfModel.attachment, a.identity.idiolect, scene, 0);
  b.affect.gates = computeGates(b.affect, b.identity.selfModel.attachment, b.identity.idiolect, scene, 0);

  const systemFor = new Map<string, string>([
    [a.identity.id, identitySystem(a, b.identity.name, scene)],
    [b.identity.id, identitySystem(b, a.identity.name, scene)],
  ]);

  yield {
    type: 'start',
    scene,
    agents: [
      { id: a.identity.id, name: a.identity.name, goals: a.goals },
      { id: b.identity.id, name: b.identity.name, goals: b.goals },
    ],
  };

  const turns: Turn[] = [];
  const records: AffectRecord[] = [];
  const forecastScores: ForecastScore[] = [];
  const pendingEvents = scheduleEvents(scene, rng);
  const wantsToEnd: Record<string, boolean> = { [a.identity.id]: false, [b.identity.id]: false };

  let minute = 0;
  let deadAirEvents = 0;
  let lastSceneEvent: string | null = null;
  let endReason = 'turn ceiling reached';

  for (let i = 0; i < config.maxTurns; i++) {
    // --- scene events fire on the clock, before anyone speaks ---
    while (pendingEvents.length && pendingEvents[0].minute <= minute) {
      const ev = pendingEvents.shift()!;
      lastSceneEvent = ev.spec.text;
      for (const agent of [a, b]) {
        agent.affect.emotion.arousal = clamp(agent.affect.emotion.arousal + ev.spec.arousal, -1, 1);
        agent.affect.emotion.valence = clamp(agent.affect.emotion.valence + ev.spec.valence, -1, 1);
        agent.affect.gates = computeGates(
          agent.affect,
          agent.identity.selfModel.attachment,
          agent.identity.idiolect,
          scene,
          agent.disclosure.intimacy,
        );
      }
      yield { type: 'scene_event', minute: Math.round(minute), text: ev.spec.text };
    }

    // --- L6: who has the floor ---
    const decision = allocateFloor(a, b, turns, rng);
    if (decision.deadAir) deadAirEvents++;
    const speaker = decision.speaker;
    const listener = decision.listener;

    // --- L2: what is on their mind ---
    const recent = turns.slice(-RECENT_WINDOW);
    const query = recent.map((t) => t.text).join(' ') || scene.description;
    const recall = retrieve(speaker.traces, query, i, speaker.affect.mood, 5);
    speaker.traces = ageTraces(speaker.traces, recall.traces, i);

    // --- L1+L3+L4: generate the turn ---
    let out: TurnOutput;
    try {
      out = await withRetry('turn generation', () => llm.generate<TurnOutput>({
        role: 'voice',
        system: systemFor.get(speaker.identity.id)!,
        user: turnUser({
          agent: speaker,
          partner: listener,
          scene,
          minute: Math.round(minute),
          recentTurns: recent,
          memories: recall.rendered,
          lastSceneEvent,
          floorReason: decision.reason,
          perceivedResponsiveness: lastPerceived(records, speaker.identity.id),
          lastForecast: lastScored(forecastScores, speaker.identity.id),
        }),
        outputSchema: turnSchema,
        mockHint: {
          kind: 'turn',
          speaker: speaker.identity.name,
          partner: listener.identity.name,
          depth: speaker.disclosure.ceiling,
          topic: recent[recent.length - 1]?.topic ?? 'getting started',
          index: i,
        },
      }));
    } catch (err) {
      yield { type: 'error', message: `turn generation failed at turn ${i}: ${(err as Error).message}` };
      endReason = 'generation error';
      break;
    }

    lastSceneEvent = null;

    // The ceiling is enforced in code, not trusted to the model.
    const ceiling = speaker.disclosure.ceiling;
    const requested = Number(out.depth) as DisclosureDepth;
    const depth = Math.min(requested, ceiling) as DisclosureDepth;

    const turn: Turn = {
      index: i,
      minute: Math.round(minute),
      agentId: speaker.identity.id,
      kind: out.kind,
      text: (out.text ?? '').trim(),
      gesture: out.gesture?.trim() ? out.gesture.trim() : null,
      depth,
      ceiling,
      clamped: requested > ceiling,
      topic: (out.topic ?? 'unspecified').trim().toLowerCase(),
      initiatedTopic: Boolean(out.initiatedTopic),
      floorReason: decision.reason,
    };
    turns.push(turn);
    speaker.lastSpokeAt = i;
    wantsToEnd[speaker.identity.id] = Boolean(out.wantsToEnd);
    minute += minutesForTurn(turn, scene);

    // --- L6b: anticipation ---
    // The listener was holding a forecast of exactly this turn. Score it before
    // anything else reads it, then record what the speaker now expects back. On
    // a double-turn the speaker's own older forecast is simply superseded; the
    // partner has not spoken yet, so there is nothing to score it against.
    const expected = listener.pendingForecast;
    let scored: ForecastScore | null = null;
    if (expected) {
      scored = scoreForecast(expected, turn);
      forecastScores.push(scored);
      listener.pendingForecast = null;
    }
    speaker.pendingForecast = {
      madeAtTurn: i,
      agentId: speaker.identity.id,
      kind: out.predictPartnerKind,
      depth: clamp(Number(out.predictPartnerDepth), 0, 4) as DisclosureDepth,
      willAsk: Boolean(out.predictPartnerAsks),
      willStayOnTopic: Boolean(out.predictPartnerStaysOnTopic),
    };

    // --- L4: both ledgers ---
    const ledger = recordDisclosure(speaker.disclosure, listener.disclosure, depth);
    speaker.disclosure = ledger.speaker;
    listener.disclosure = ledger.listener;

    yield { type: 'turn', turn };
    if (scored) yield { type: 'forecast', score: scored };

    // --- L3: the listener appraises what just happened ---
    const listenerLastTurn = [...turns].reverse().find((t) => t.agentId === listener.identity.id) ?? null;
    let appraisalOut: AppraisalOutput;
    try {
      appraisalOut = await withRetry('appraisal', () => llm.generate<AppraisalOutput>({
        role: 'analyst',
        system: appraisalSystem(),
        user: appraisalUser({
          listener,
          speaker,
          speakerTurn: turn,
          listenerLastTurn,
          minute: Math.round(minute),
          listenerExpected: expected,
        }),
        outputSchema: appraisalSchema,
        mockHint: {
          kind: 'appraisal',
          // Give the mock a trajectory so state visibly moves: warms early,
          // cools after the midpoint. Enough to exercise every downstream path.
          bias: i < config.maxTurns * 0.55 ? 0.7 : -0.5,
          index: i,
        },
      }));
    } catch (err) {
      yield { type: 'error', message: `appraisal failed at turn ${i}: ${(err as Error).message}` };
      endReason = 'appraisal error';
      break;
    }

    const appraisal: Appraisal = {
      goalCongruence: clamp(appraisalOut.goalCongruence, -1, 1),
      novelty: clamp(appraisalOut.novelty, 0, 1),
      agency: appraisalOut.agency,
      socialEsteem: clamp(appraisalOut.socialEsteem, -1, 1),
      partnerDesirability: clamp(appraisalOut.partnerDesirability, -1, 1),
      certainty: clamp(appraisalOut.certainty, 0, 1),
      emotion: appraisalOut.emotion,
      note: appraisalOut.note,
    };

    const actual = {
      understanding: clamp(appraisalOut.understanding, 0, 1),
      validation: clamp(appraisalOut.validation, 0, 1),
      caring: clamp(appraisalOut.caring, 0, 1),
    };

    // The responsiveness gap: what the turn conveyed vs. what the listener read.
    const stakes = (listenerLastTurn?.depth ?? 0) as DisclosureDepth;
    const perceived = perceiveResponsiveness(
      actual,
      listener.identity.selfModel.attachment,
      listener.affect.mood,
      stakes,
    );

    listener.disclosure = stepDisclosure(listener.disclosure, perceived, listener.affect.gates, stakes);
    listener.affect = stepAffect(
      listener.affect,
      appraisal,
      listener.identity.selfModel.attachment,
      listener.identity.idiolect,
      scene,
      listener.disclosure.intimacy,
      speaker.affect.mood,
      minute,
    );

    const record: AffectRecord = {
      turn: i,
      minute: Math.round(minute),
      agentId: listener.identity.id,
      appraisal,
      label: appraisal.emotion,
      mood: { ...listener.affect.mood },
      emotion: { ...listener.affect.emotion },
      gates: { ...listener.affect.gates },
      actualResponsiveness: actual,
      perceivedResponsiveness: perceived,
      responsivenessGap: responsivenessGap(actual, perceived),
      intimacy: listener.disclosure.intimacy,
      ceiling: listener.disclosure.ceiling,
    };
    records.push(record);
    yield { type: 'affect', record };

    // --- L2: per-dyad memory, updated sparsely (2 extra analyst calls) ---
    if (i > 0 && i % RELATIONAL_EVERY === 0) {
      for (const [self, other] of [[a, b], [b, a]] as const) {
        try {
          const rel = await llm.generate<RelationalOutput>({
            role: 'analyst',
            system: relationalSystem(),
            user: relationalUser(self, other, turns.slice(-RELATIONAL_EVERY * 2)),
            outputSchema: relationalSchema,
          });
          self.relational = {
            ...self.relational,
            modelOfThem: rel.modelOfThem || self.relational.modelOfThem,
            openThreads: rel.openThreads ?? [],
            runningJokes: rel.runningJokes ?? [],
            frictionPoints: rel.frictionPoints ?? [],
          };
        } catch {
          // A stale read on the partner is survivable; a dead date is not.
        }
      }
    }
    // Cheap ledger side of relational memory always runs.
    speaker.relational.toldThem.push({ depth, topic: turn.topic, turn: i });
    listener.relational.theyToldMe.push({ depth, topic: turn.topic, turn: i });

    // --- L6: does this end here ---
    const end = checkEnd({
      a, b,
      minute,
      turnIndex: i + 1,
      maxTurns: config.maxTurns,
      scene,
      wantsToEnd,
      lastTurn: turn,
    });
    if (end.ended) {
      endReason = end.reason;
      break;
    }
  }

  yield { type: 'end', reason: endReason, minutes: Math.round(minute), turns: turns.length };
  yield { type: 'debrief', debrief: buildDebrief({ a, b, turns, records, deadAirEvents, forecastScores }) };
}

function lastPerceived(records: AffectRecord[], agentId: string): number | null {
  const r = [...records].reverse().find((x) => x.agentId === agentId);
  return r ? meanResponsiveness(r.perceivedResponsiveness) : null;
}

function lastScored(scores: ForecastScore[], agentId: string): ForecastScore | null {
  return [...scores].reverse().find((s) => s.agentId === agentId) ?? null;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
