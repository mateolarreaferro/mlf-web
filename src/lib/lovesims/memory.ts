/**
 * L2, Memory retrieval.
 *
 * Phase 1 keeps the 2023 generative-agents scoring (recency × importance ×
 * relevance) but adds the two things that make an agent feel alive rather than
 * uncanny:
 *
 *   - decay, so an agent does not have perfect recall (you cannot *reveal*
 *     something to someone who never forgets), and
 *   - mood-congruent reconstructive recall, so a bad mood surfaces a bleaker
 *     version of the same event.
 *
 * Relevance is lexical overlap rather than embeddings. That is a deliberate
 * Phase-1 shortcut: it is cheap, deterministic, and good enough on a corpus of
 * ~27 one-sentence facts per agent. Swapping in pgvector is a change to this
 * function only.
 */

import type { MemoryTrace, PAD, RelationalMemory } from './types';

const STOPWORDS = new Set(
  ('a an the and or but if then than that this these those of in on at to for with from by about into over after ' +
    'before is are was were be been being do does did have has had he she they it his her their its him them i you ' +
    'we us our your my me not no so as up out very just also more most some any all when where who what which how')
    .split(' '),
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function overlap(a: string[], b: Set<string>): number {
  if (a.length === 0) return 0;
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits / Math.sqrt(a.length);
}

export interface RetrievalResult {
  traces: MemoryTrace[];
  /** Traces re-rendered in this agent's current mood. */
  rendered: string[];
}

export function retrieve(
  traces: MemoryTrace[],
  query: string,
  turnIndex: number,
  mood: PAD,
  k = 6,
): RetrievalResult {
  const q = new Set(tokens(query));

  const scored = traces.map((t) => {
    const relevance = overlap(tokens(t.text), q);
    const sinceRecall = t.lastRecalledAt < 0 ? 1 : Math.min(1, (turnIndex - t.lastRecalledAt) / 12);
    // Recently surfaced material stays accessible; long-dormant material fades.
    const recency = 1 - 0.4 * sinceRecall;
    // Mood-congruent recall: a sour mood makes sour memories more available.
    const congruence = 1 + 0.35 * Math.sign(mood.valence) * Math.sign(t.valence) * Math.min(1, Math.abs(mood.valence));
    return { trace: t, score: (0.45 * relevance + 0.35 * t.salience + 0.2 * recency) * congruence };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.trace);

  return { traces: top, rendered: top.map((t) => render(t, mood)) };
}

/**
 * Reconstructive recall. The trace is not replayed verbatim; it is re-rendered
 * with the colouring the current mood gives it. Cheap, and it makes the emotion
 * model visible in what the agent remembers rather than in adjectives.
 */
function render(trace: MemoryTrace, mood: PAD): string {
  if (mood.valence < -0.35 && trace.valence <= 0) return `${trace.text} — and it still sits badly.`;
  if (mood.valence > 0.35 && trace.valence >= 0) return `${trace.text} — one of the good ones.`;
  return trace.text;
}

/** Reinforce what surfaced, decay everything else. Called once per turn. */
export function ageTraces(traces: MemoryTrace[], recalled: MemoryTrace[], turnIndex: number): MemoryTrace[] {
  const recalledIds = new Set(recalled.map((t) => t.id));
  return traces.map((t) =>
    recalledIds.has(t.id)
      ? { ...t, salience: Math.min(1, t.salience + 0.05), lastRecalledAt: turnIndex }
      : { ...t, salience: Math.max(0.05, t.salience * 0.994) },
  );
}

export function emptyRelational(): RelationalMemory {
  return {
    toldThem: [],
    theyToldMe: [],
    openThreads: [],
    runningJokes: [],
    frictionPoints: [],
    modelOfThem: 'No read on them yet.',
  };
}

/** Render the per-dyad memory for the prompt. This is what makes date 40 differ from date 1. */
export function relationalSummary(rel: RelationalMemory): string {
  const parts: string[] = [];
  if (rel.theyToldMe.length) {
    const deepest = rel.theyToldMe.reduce((a, b) => (b.depth > a.depth ? b : a));
    parts.push(`They have told you about: ${uniq(rel.theyToldMe.map((t) => t.topic)).join(', ')}. The most personal was ${deepest.topic}.`);
  }
  if (rel.toldThem.length) {
    parts.push(`You have told them about: ${uniq(rel.toldThem.map((t) => t.topic)).join(', ')}.`);
  }
  if (rel.openThreads.length) parts.push(`Unfinished: ${rel.openThreads.join('; ')}.`);
  if (rel.frictionPoints.length) parts.push(`Friction so far: ${rel.frictionPoints.join('; ')}.`);
  parts.push(`Your read on them: ${rel.modelOfThem}`);
  return parts.join(' ');
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)].slice(0, 8);
}
