/**
 * L1: identity, and L2's initial memory traces.
 *
 * On the site the corpus is `cast.ts`, twelve invented people (see the note
 * there: the interview corpus the research ran on must never enter this
 * repository). The code path is unchanged from the research build: Tier 0
 * (a verbatim transcript) is read when present and the extracted facts are
 * the fallback, so dropping a consented corpus in is a data change, not a
 * code change.
 *
 * Tier 1 (self-model) and Tier 2 (idiolect) are derived deterministically
 * here from the persona text and the facts, with attachment style assigned by
 * a stable hash and flagged as a stand-in.
 */

import { CAST, type RawAgent } from './cast';
import type {
  AgentIdentity,
  Attachment,
  Idiolect,
  MemoryTrace,
  PrivateGoals,
  SelfModel,
} from './types';
import { makeRng } from './scene';

const CORPUS = { agents: CAST };

export const hasAgent = (id: string) => CORPUS.agents.some((a) => a.id === id);

export function listAgents() {
  return CORPUS.agents.map((a) => ({
    id: a.id,
    name: a.name,
    age: a.age,
    gender: a.gender,
    blurb: a.persona.split('. ').slice(0, 2).join('. ') + '.',
    memoryCount: a.memories.length,
    hasTranscript: Boolean(a.transcript),
  }));
}

export function hasTier0(): boolean {
  return CORPUS.agents.some((a) => Boolean(a.transcript));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ATTACHMENTS: Attachment[] = ['secure', 'anxious', 'avoidant', 'fearful'];

// "values honesty and authenticity", "values kindness, humor, and self-awareness"
const VALUES_RE = /values? ([a-z][a-z\s,'-]*?)(?: in (?:her|his|their|other)|[.;])/i;

function extractValues(persona: string): string[] {
  const m = VALUES_RE.exec(persona);
  if (!m) return [];
  return m[1]
    .replace(/\band\b/g, ',')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 2 && v.split(' ').length <= 3)
    .slice(0, 4);
}

/**
 * The anti-collapse device: the facts about this person a generically pleasant
 * agent would not produce. Specificity is proxied by proper nouns and numbers,
 * which is exactly what the corpus's interview-derived facts are dense in.
 */
function differenceVector(memories: string[]): string[] {
  const scored = memories.map((m) => {
    const propers = (m.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).length;
    const numbers = (m.match(/\b\d+\b/g) ?? []).length;
    const isGeneric = /\bvalues\b|\benjoys\b|\bloves to\b/i.test(m);
    return { m, score: propers * 2 + numbers * 1.5 + m.length / 60 - (isGeneric ? 3 : 0) };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.m);
}

function deriveIdiolect(agent: RawAgent, rng: () => number): Idiolect {
  const text = agent.memories.join(' ');
  const sentences = agent.memories.length || 1;
  const avgWords = text.split(/\s+/).length / sentences;

  // Narrativity: how much of the corpus is events with time markers vs. traits.
  const narrative = agent.memories.filter((m) => /\b(when|after|during|then|moved|started|left)\b/i.test(m)).length;
  const narrativity = clamp01(narrative / sentences);

  const tells = [
    'makes a joke and changes the subject',
    'over-explains and then apologises for over-explaining',
    'goes quiet and waits for the other person to fill it',
    'asks a question back instead of answering',
    'gets very literal and precise',
  ];

  return {
    meanTurnLength: Math.round(18 + avgWords * 0.35 + rng() * 14),
    questionRate: 0.2 + rng() * 0.35,
    hedging: 0.15 + rng() * 0.45,
    narrativity,
    exemplars: agent.memories.slice(0, 6),
    discomfortTell: tells[Math.floor(rng() * tells.length)],
  };
}

function deriveSelfModel(agent: RawAgent, rng: () => number, attachmentOverride?: Attachment): SelfModel {
  const values = extractValues(agent.persona);
  const h = hash(agent.id);
  const attachment = attachmentOverride ?? ATTACHMENTS[h % ATTACHMENTS.length];

  const insecurities = [
    'that they are interesting only because of what they have accomplished',
    'that they are too much for people once they relax',
    'that they will end up doing what is expected of them',
    'that they are further behind than everyone around them',
    'that people leave once they know the whole story',
  ];
  const humor = ['dry and deadpan', 'warm and self-deprecating', 'quick, a bit mean, affectionate', 'absurdist, non-sequitur', 'observational, low-key'];

  return {
    values: values.length ? values : ['honesty', 'curiosity'],
    dealbreakers: ['someone who performs interest without paying attention', 'contempt disguised as a joke'],
    attachment,
    humorRegister: humor[Math.floor(rng() * humor.length)],
    insecurity: insecurities[Math.floor(rng() * insecurities.length)],
    statedWant: 'someone they can talk to for hours',
    revealedWant: 'someone who makes the version of themselves they like more available',
    differenceVector: differenceVector(agent.memories),
  };
}

/**
 * L7. Private, partially conflicting goals are what make the interaction
 * diagnostic. This is the practical answer to homogenisation: you cannot prompt
 * your way out of agreeableness, but you can structure your way out of it.
 */
export function deriveGoals(agent: RawAgent, rng: () => number): PrivateGoals {
  const overt = [
    'find out whether there is anything here worth a second night',
    'have a good time and not think about work for two hours',
    'see whether this person is actually curious about other people',
    'confirm a suspicion that they are not ready to be dating',
  ];
  const covert = [
    'came out of a five-year relationship two months ago and has not said so out loud yet',
    'has already decided they are not attracted, and is being polite about it',
    'is comparing this person to someone specific the whole time',
    'is more nervous than they have been in a year and is compensating',
    'agreed to this mostly because a friend pushed them into it',
  ];
  const secrets = [
    'they are seriously considering leaving the field entirely',
    'the friend they talk about most stopped speaking to them last year',
    'they have been in therapy weekly for three years and never mention it',
    'they are the reason their last relationship ended, and they know it',
  ];
  const constraints = [
    'needs to be home by ten and has not mentioned it',
    'does not want to talk about work tonight',
    'wants to find out whether this person wants kids without asking directly',
    'has a hard rule about not drinking on a first date',
  ];

  return {
    overt: pick(overt, rng),
    covert: pick(covert, rng),
    secret: pick(secrets, rng),
    constraint: pick(constraints, rng),
  };
}

export function loadAgent(
  id: string,
  seed: number,
  attachmentOverride?: Attachment,
): { identity: AgentIdentity; goals: PrivateGoals; traces: MemoryTrace[] } {
  const agent = CORPUS.agents.find((a) => a.id === id);
  if (!agent) throw new Error(`unknown agent: ${id}`);

  const rng = makeRng(hash(agent.id) ^ seed);

  const identity: AgentIdentity = {
    id: agent.id,
    name: agent.name,
    age: agent.age,
    gender: agent.gender,
    transcript: agent.transcript,
    memories: agent.memories,
    persona: agent.persona,
    selfModel: deriveSelfModel(agent, rng, attachmentOverride),
    idiolect: deriveIdiolect(agent, rng),
  };

  return { identity, goals: deriveGoals(agent, rng), traces: buildTraces(agent) };
}

/**
 * L2, initial traces. Salience seeds importance; decay and mood-congruent
 * retrieval happen in memory.ts.
 */
function buildTraces(agent: RawAgent): MemoryTrace[] {
  return agent.memories.map((text, i) => {
    const episodic = /\b(when|after|during|moved|started|left|died|cried|broke)\b/i.test(text);
    const emotional = /\b(cried|died|divorce|breakup|broke up|left|lost|afraid|hard)\b/i.test(text);
    const valence = emotional ? -0.5 : /\b(loves|enjoys|happy|dream)\b/i.test(text) ? 0.4 : 0;
    return {
      id: `${agent.id}-${i}`,
      kind: episodic ? 'episodic' : 'semantic',
      text,
      salience: clamp01(0.35 + (emotional ? 0.35 : 0) + Math.min(text.length, 200) / 800),
      lastRecalledAt: -1,
      valence,
    };
  });
}

function pick<T>(xs: T[], rng: () => number): T {
  return xs[Math.floor(rng() * xs.length)];
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}
