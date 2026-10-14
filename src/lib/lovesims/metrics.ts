/**
 * Measurement.
 *
 * The shift this file represents: stop asking a judge LLM how compatible two
 * people are, and start computing what happened between them. Nothing here calls
 * a model. Every number falls out of the turn log and the affect records, which
 * means each one is auditable and reproducible.
 *
 * Deliberately absent: a compatibility score. Joel, Eastwick & Finkel (2017)
 * found relationship variance unpredictable from pre-meeting data; emitting a
 * single number would be making exactly the claim the literature does not support.
 */

import type {
  AffectRecord,
  AnticipationMetrics,
  DateAgent,
  Debrief,
  DisclosureDepth,
  ForecastScore,
  ForecastSlots,
  Moment,
  PartnerForecast,
  PerAgentMetrics,
  Turn,
} from './types';

// ---------------------------------------------------------------------------
// Language Style Matching (Ireland & Pennebaker)
// ---------------------------------------------------------------------------

const LSM_CATEGORIES: Record<string, string[]> = {
  personalPronouns: ['i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their'],
  impersonalPronouns: ['it', 'its', 'this', 'that', 'these', 'those', 'something', 'anything', 'everything', 'nothing', 'which', 'what'],
  articles: ['a', 'an', 'the'],
  conjunctions: ['and', 'but', 'or', 'so', 'because', 'although', 'though', 'while', 'whereas', 'if', 'then', 'than'],
  prepositions: ['in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'about', 'into', 'over', 'after', 'before', 'through', 'under', 'between'],
  auxiliaryVerbs: ['is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'might', 'must'],
  adverbs: ['very', 'really', 'just', 'so', 'too', 'quite', 'always', 'never', 'often', 'sometimes', 'actually', 'basically', 'probably', 'maybe'],
  negations: ['no', 'not', 'never', 'none', 'nothing', 'nobody', 'nowhere', "don't", "doesn't", "didn't", "won't", "can't", "isn't", "wasn't"],
  quantifiers: ['all', 'some', 'most', 'many', 'much', 'few', 'lot', 'lots', 'every', 'each', 'more', 'less', 'enough'],
};

function categoryRates(text: string): Record<string, number> {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const total = Math.max(words.length, 1);
  const rates: Record<string, number> = {};
  for (const [cat, list] of Object.entries(LSM_CATEGORIES)) {
    const set = new Set(list);
    rates[cat] = words.filter((w) => set.has(w)).length / total;
  }
  return rates;
}

/**
 * 1 − |a−b| / (a+b), averaged over the nine function-word categories.
 * 1.0 is perfect synchrony; ~0.8 is typical for engaged conversation.
 */
export function languageStyleMatching(textA: string, textB: string): number {
  const a = categoryRates(textA);
  const b = categoryRates(textB);
  const scores = Object.keys(LSM_CATEGORIES).map((cat) => {
    const x = a[cat];
    const y = b[cat];
    return 1 - Math.abs(x - y) / (x + y + 0.0001);
  });
  return scores.reduce((s, v) => s + v, 0) / scores.length;
}

// ---------------------------------------------------------------------------
// Anticipation, empathic accuracy against the partner's actual next move
// ---------------------------------------------------------------------------

/**
 * Slot weights. Which move they make carries the most, because it is the hardest
 * to get right and the least guessable from the base rate; the two booleans are
 * cheap to hit by chance and weighted accordingly. The weights sum to 1 so the
 * composite reads on the same 0–1 scale as its parts.
 */
const FORECAST_WEIGHTS = { kind: 0.4, depth: 0.3, ask: 0.15, topic: 0.15 } as const;

/** Same definition of "asked something" the question ratio uses, deliberately. */
function turnAsks(t: Turn): boolean {
  return t.kind === 'ask' || t.text.includes('?');
}

export function slotsOf(t: Turn): ForecastSlots {
  return {
    kind: t.kind,
    depth: t.depth,
    willAsk: turnAsks(t),
    // A turn that did not introduce its topic stayed on the one already running.
    willStayOnTopic: !t.initiatedTopic,
  };
}

function composite(kindHit: boolean, depthError: number, askHit: boolean, topicHit: boolean): number {
  return (
    FORECAST_WEIGHTS.kind * (kindHit ? 1 : 0) +
    FORECAST_WEIGHTS.depth * (1 - depthError / 4) +
    FORECAST_WEIGHTS.ask * (askHit ? 1 : 0) +
    FORECAST_WEIGHTS.topic * (topicHit ? 1 : 0)
  );
}

/**
 * Score one forecast against the turn it was predicting.
 *
 * Note the depth comparison is against the *clamped* depth, what the partner
 * actually said, not what their model asked for. The forecaster could not have
 * known the ceiling either, so the clamped value is the fair target.
 */
export function scoreForecast(f: PartnerForecast, turn: Turn): ForecastScore {
  const actual = slotsOf(turn);
  const predicted: ForecastSlots = {
    kind: f.kind,
    depth: f.depth,
    willAsk: f.willAsk,
    willStayOnTopic: f.willStayOnTopic,
  };
  const kindHit = predicted.kind === actual.kind;
  const depthError = Math.abs(predicted.depth - actual.depth);
  const askHit = predicted.willAsk === actual.willAsk;
  const topicHit = predicted.willStayOnTopic === actual.willStayOnTopic;
  return {
    turn: turn.index,
    madeAtTurn: f.madeAtTurn,
    agentId: f.agentId,
    predicted,
    actual,
    kindHit,
    depthError,
    askHit,
    topicHit,
    accuracy: composite(kindHit, depthError, askHit, topicHit),
  };
}

const EMPTY_ANTICIPATION: AnticipationMetrics = {
  forecasts: 0, kindAccuracy: 0, depthMae: 0, askAccuracy: 0,
  topicAccuracy: 0, composite: 0, baseline: 0, skill: 0,
  causalBaseline: 0, causalSkill: 0, causalFrom: 0,
};

/** The single constant guess that scores best on the values it is given. */
function bestConstant<T>(values: T[], loss: (guess: T, actual: T) => number, candidates: T[]): T {
  let best = candidates[0];
  let bestLoss = Infinity;
  for (const c of candidates) {
    const l = values.reduce((s, v) => s + loss(c, v), 0);
    if (l < bestLoss) { bestLoss = l; best = c; }
  }
  return best;
}

const zeroOne = <T,>(g: T, a: T) => (g === a ? 0 : 1);

/** The best constant fitted on a set of observed turns, evaluated against one more. */
function constantScore(fittedOn: ForecastSlots[], against: ForecastSlots): number {
  const gKind = bestConstant(fittedOn.map((x) => x.kind), zeroOne, [...new Set(fittedOn.map((x) => x.kind))]);
  const gDepth = bestConstant<DisclosureDepth>(fittedOn.map((x) => x.depth), (g, a) => Math.abs(g - a), [0, 1, 2, 3, 4]);
  const gAsk = bestConstant(fittedOn.map((x) => x.willAsk), zeroOne, [true, false]);
  const gTopic = bestConstant(fittedOn.map((x) => x.willStayOnTopic), zeroOne, [true, false]);
  return composite(
    against.kind === gKind,
    Math.abs(gDepth - against.depth),
    against.willAsk === gAsk,
    against.willStayOnTopic === gTopic,
  );
}

/**
 * Raw accuracy mostly measures how predictable the partner was, so it is close
 * to meaningless alone: a partner who answers every turn at D1 can be called
 * correctly by a rock. The baseline is therefore the best *constant* predictor
 * of this specific partner on this specific date, fitted after the fact. It is a
 * deliberately hard bar, beating it means the forecast tracked something that
 * moved, which is the only version of this measure worth reporting.
 */
function anticipationFor(agentId: string, scores: ForecastScore[]): AnticipationMetrics {
  const mine = scores.filter((s) => s.agentId === agentId);
  if (!mine.length) return { ...EMPTY_ANTICIPATION };

  const actual = mine.map((s) => s.actual);
  const baseline = mean(actual.map((a) => constantScore(actual, a)));

  // Prequential: refit the constant on only what had been seen at the time. The
  // first forecast has no history and is excluded from both means, so the two
  // averages differenced below are taken over the same forecasts.
  let causalBase = 0;
  let causalComp = 0;
  for (let i = 1; i < mine.length; i++) {
    causalBase += constantScore(actual.slice(0, i), actual[i]);
    causalComp += mine[i].accuracy;
  }
  const causalFrom = Math.max(0, mine.length - 1);

  const compositeScore = mean(mine.map((s) => s.accuracy));
  return {
    forecasts: mine.length,
    kindAccuracy: mean(mine.map((s) => (s.kindHit ? 1 : 0))),
    depthMae: mean(mine.map((s) => s.depthError)),
    askAccuracy: mean(mine.map((s) => (s.askHit ? 1 : 0))),
    topicAccuracy: mean(mine.map((s) => (s.topicHit ? 1 : 0))),
    composite: compositeScore,
    baseline,
    skill: compositeScore - baseline,
    causalBaseline: causalFrom ? causalBase / causalFrom : 0,
    causalSkill: causalFrom ? (causalComp - causalBase) / causalFrom : 0,
    causalFrom,
  };
}

// ---------------------------------------------------------------------------
// Turn-level measures
// ---------------------------------------------------------------------------

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'it', 'that', 'this']);

function contentTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 3 && !STOP.has(t)),
  );
}

function sharesContent(a: string, b: string): boolean {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

/** The ten moves a turn can make. Kept here so the entropy denominator is fixed. */
const TURN_KIND_COUNT = 10;

/** Normalised Shannon entropy, 0 when every turn is the same move, 1 when uniform. */
function kindEntropy(kinds: string[]): number {
  if (kinds.length < 2) return 0;
  const counts = new Map<string, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / kinds.length;
    h -= p * Math.log2(p);
  }
  return h / Math.log2(TURN_KIND_COUNT);
}

function perAgent(agent: DateAgent, turns: Turn[], records: AffectRecord[], scores: ForecastScore[]): PerAgentMetrics {
  const id = agent.identity.id;
  const mine = turns.filter((t) => t.agentId === id);
  const spoken = mine.filter((t) => t.kind !== 'silence');
  const myRecords = records.filter((r) => r.agentId === id);

  const questions = mine.filter((t) => t.kind === 'ask' || t.text.includes('?')).length;

  const initiations = turns.filter((t) => t.initiatedTopic);
  const myInitiations = initiations.filter((t) => t.agentId === id).length;

  // Uptake: did this turn build on the content of the immediately previous one.
  let uptake = 0;
  let uptakeOpportunities = 0;
  for (let i = 1; i < turns.length; i++) {
    if (turns[i].agentId !== id) continue;
    if (turns[i - 1].agentId === id) continue;
    uptakeOpportunities++;
    if (turns[i].topic === turns[i - 1].topic || sharesContent(turns[i].text, turns[i - 1].text)) uptake++;
  }

  const positive = myRecords.filter((r) => r.mood.valence + r.emotion.valence > 0.1).length;
  const words = spoken.reduce((s, t) => s + t.text.trim().split(/\s+/).length, 0);

  return {
    agentId: id,
    name: agent.identity.name,
    turns: mine.length,
    meanTurnWords: spoken.length ? Math.round(words / spoken.length) : 0,
    questionRatio: mine.length ? questions / mine.length : 0,
    topicInitiative: initiations.length ? myInitiations / initiations.length : 0,
    uptakeRate: uptakeOpportunities ? uptake / uptakeOpportunities : 0,
    deepestDepth: agent.disclosure.reached,
    disclosureGiven: agent.disclosure.given,
    disclosureReceived: agent.disclosure.received,
    repairAttempts: mine.filter((t) => t.kind === 'repair').length,
    responsivenessGap: myRecords.length ? mean(myRecords.map((r) => r.responsivenessGap)) : 0,
    positivityRatio: myRecords.length ? positive / myRecords.length : 0,
    finalMoodValence: agent.affect.mood.valence,
    violations: agent.disclosure.violations,
    kindEntropy: kindEntropy(mine.map((t) => t.kind)),
    safeMoveRatio: mine.length ? mine.filter((t) => t.kind === 'ask' || t.kind === 'answer').length / mine.length : 0,
    anticipation: anticipationFor(id, scores),
  };
}

// ---------------------------------------------------------------------------
// Moments
// ---------------------------------------------------------------------------

function findMoments(
  turns: Turn[],
  records: AffectRecord[],
  scores: ForecastScore[],
  nameOf: (id: string) => string,
): Moment[] {
  const moments: Moment[] = [];
  const byTurn = new Map<number, AffectRecord[]>();
  for (const r of records) {
    const list = byTurn.get(r.turn) ?? [];
    list.push(r);
    byTurn.set(r.turn, list);
  }
  const turnAt = (i: number) => turns.find((t) => t.index === i);

  // Peak: highest combined valence.
  let best = { turn: -1, score: -Infinity };
  for (const [turnIdx, recs] of byTurn) {
    const score = mean(recs.map((r) => r.mood.valence + r.emotion.valence));
    if (score > best.score) best = { turn: turnIdx, score };
  }
  if (best.turn >= 0) {
    const t = turnAt(best.turn);
    if (t) moments.push({
      turn: t.index, minute: Math.round(t.minute), kind: 'peak',
      label: 'the high point',
      excerpt: t.text,
      evidence: `combined valence peaked at ${best.score.toFixed(2)} on this turn`,
    });
  }

  // Rupture: sharpest single-turn valence drop for either agent.
  let worst = { turn: -1, drop: 0, who: '' };
  const sorted = [...records].sort((a, b) => a.turn - b.turn);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted.slice(0, i).reverse().find((r) => r.agentId === sorted[i].agentId);
    if (!prev) continue;
    const drop = prev.mood.valence - sorted[i].mood.valence;
    if (drop > worst.drop) worst = { turn: sorted[i].turn, drop, who: sorted[i].agentId };
  }
  if (worst.turn >= 0 && worst.drop > 0.08) {
    const t = turnAt(worst.turn);
    if (t) moments.push({
      turn: t.index, minute: Math.round(t.minute), kind: 'rupture',
      label: 'where it turned',
      excerpt: t.text,
      evidence: `mood fell ${worst.drop.toFixed(2)} for one of them across this turn`,
    });
  }

  // Repair: an explicit repair attempt, with whether it worked.
  const repair = turns.find((t) => t.kind === 'repair');
  if (repair) {
    const after = records.filter((r) => r.turn > repair.index).slice(0, 2);
    const recovered = after.length > 0 && mean(after.map((r) => r.emotion.valence)) > 0;
    moments.push({
      turn: repair.index, minute: Math.round(repair.minute), kind: 'repair',
      label: recovered ? 'a repair that worked' : 'a repair that did not land',
      excerpt: repair.text,
      evidence: recovered ? 'valence recovered on the following turns' : 'valence did not recover afterwards',
    });
  }

  // Deepest disclosure.
  const deepest = turns.reduce<Turn | null>((acc, t) => (!acc || t.depth > acc.depth ? t : acc), null);
  if (deepest && deepest.depth >= 2) {
    moments.push({
      turn: deepest.index, minute: Math.round(deepest.minute), kind: 'deepest',
      label: `the most personal thing said (D${deepest.depth})`,
      excerpt: deepest.text,
      evidence: `disclosure depth ${deepest.depth} on the ladder`,
    });
  }

  // Largest responsiveness gap, the misread.
  const gap = records.reduce<AffectRecord | null>(
    (acc, r) => (!acc || Math.abs(r.responsivenessGap) > Math.abs(acc.responsivenessGap) ? r : acc),
    null,
  );
  if (gap && Math.abs(gap.responsivenessGap) > 0.08) {
    const t = turnAt(gap.turn);
    if (t) moments.push({
      turn: t.index, minute: Math.round(t.minute), kind: 'gap',
      label: gap.responsivenessGap < 0 ? 'read as colder than it was' : 'read as warmer than it was',
      excerpt: t.text,
      evidence: `perceived responsiveness differed from what the turn conveyed by ${gap.responsivenessGap.toFixed(2)}`,
    });
  }

  // The worst misread: the turn that least resembled what the other one was
  // braced for. Distinct from the responsiveness gap above, that is misreading
  // how warm a turn was, this is not seeing it coming at all.
  const missed = scores.reduce<ForecastScore | null>(
    (acc, s) => (!acc || s.accuracy < acc.accuracy ? s : acc),
    null,
  );
  if (missed && missed.accuracy < 0.4) {
    const t = turnAt(missed.turn);
    if (t) moments.push({
      turn: t.index, minute: Math.round(t.minute), kind: 'misread',
      label: `${nameOf(missed.agentId)} did not see this coming`,
      excerpt: t.text,
      evidence: `expected ${missed.predicted.kind} at D${missed.predicted.depth}, got ${missed.actual.kind} at D${missed.actual.depth}`,
    });
  }

  return moments.sort((a, b) => a.turn - b.turn);
}

// ---------------------------------------------------------------------------
// Shared interests, the bridge-to-real input
// ---------------------------------------------------------------------------

function sharedInterests(turns: Turn[]) {
  const byTopic = new Map<string, { turns: number[]; agents: Set<string> }>();
  for (const t of turns) {
    if (t.kind === 'silence') continue;
    const key = t.topic.toLowerCase().trim();
    if (!key) continue;
    const entry = byTopic.get(key) ?? { turns: [], agents: new Set<string>() };
    entry.turns.push(t.index);
    entry.agents.add(t.agentId);
    byTopic.set(key, entry);
  }

  return [...byTopic.entries()]
    // Both people have to have engaged with it, or it is not shared.
    .filter(([, v]) => v.agents.size > 1 && v.turns.length >= 2)
    .map(([topic, v]) => ({ topic, turns: v.turns, sustainedTurns: longestRun(v.turns) }))
    .sort((a, b) => b.sustainedTurns - a.sustainedTurns || b.turns.length - a.turns.length)
    .slice(0, 5);
}

function longestRun(indices: number[]): number {
  const s = [...indices].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < s.length; i++) {
    if (s[i] === s[i - 1] + 1) run++;
    else run = 1;
    best = Math.max(best, run);
  }
  return best;
}

// ---------------------------------------------------------------------------

export function buildDebrief(args: {
  a: DateAgent;
  b: DateAgent;
  turns: Turn[];
  records: AffectRecord[];
  deadAirEvents: number;
  forecastScores: ForecastScore[];
}): Debrief {
  const { a, b, turns, records, deadAirEvents, forecastScores } = args;

  const textA = turns.filter((t) => t.agentId === a.identity.id).map((t) => t.text).join(' ');
  const textB = turns.filter((t) => t.agentId === b.identity.id).map((t) => t.text).join(' ');

  const givenA = a.disclosure.given;
  const givenB = b.disclosure.given;
  const reciprocityIndex = givenA + givenB === 0 ? 1 : 1 - Math.abs(givenA - givenB) / (givenA + givenB);

  const metricsA = perAgent(a, turns, records, forecastScores);
  const metricsB = perAgent(b, turns, records, forecastScores);
  const nameOf = (id: string) => (id === a.identity.id ? a.identity.name : b.identity.name);

  // Mutual interest requires both sides, on both channels, and neither trying to
  // leave. Each condition is expressed as signed slack so the conjunction can be
  // read continuously; the boolean is just "every slack is positive".
  //
  // The slacks are in different units and are not rescaled to each other. That is
  // deliberate: any rescaling would be a second set of invented constants layered
  // over the first. The margin is therefore ordinal, useful for ranking dates and
  // for seeing which condition binds, not a calibrated distance.
  const conditions: { name: string; slack: number }[] = [
    { name: `${a.identity.name} mood`, slack: metricsA.finalMoodValence - 0.15 },
    { name: `${b.identity.name} mood`, slack: metricsB.finalMoodValence - 0.15 },
    { name: `${a.identity.name} intimacy`, slack: a.disclosure.intimacy - 0.4 },
    { name: `${b.identity.name} intimacy`, slack: b.disclosure.intimacy - 0.4 },
    { name: `${a.identity.name} staying`, slack: 0.5 - a.affect.gates.exitDesire },
    { name: `${b.identity.name} staying`, slack: 0.5 - b.affect.gates.exitDesire },
  ];
  const binding = conditions.reduce((lo, c) => (c.slack < lo.slack ? c : lo));
  const mutualInterest = binding.slack > 0;

  return {
    lsm: languageStyleMatching(textA, textB),
    reciprocityIndex,
    deadAirEvents,
    mutualInterest,
    mutualInterestMargin: binding.slack,
    mutualInterestBinding: binding.name,
    perAgent: [metricsA, metricsB],
    moments: findMoments(turns, records, forecastScores, nameOf),
    affectTrack: records,
    forecastScores,
    sharedInterests: sharedInterests(turns),
  };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
}

export function deepestLabel(d: DisclosureDepth): string {
  return `D${d}`;
}
