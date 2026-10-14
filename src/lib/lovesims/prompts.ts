/**
 * Prompt construction.
 *
 * Split deliberately along the cache boundary: the *system* block is everything
 * constant for the whole date (Tier 0 transcript, self-model, idiolect, private
 * goals) and carries the cache breakpoint; the *user* block is the volatile
 * per-turn state. A 30-turn date therefore pays for the transcript once.
 */

import { gatesToDirectives } from './affect';
import { DEPTH_DESCRIPTIONS, disclosureDirectives } from './disclosure';
import { relationalSummary } from './memory';
import { arrayOf, bool, enumOf, num, schema, str } from './llm';
import { DEPTH_LABELS, type DateAgent, type ForecastScore, type ForecastSlots, type PartnerForecast, type Scene, type Turn } from './types';

const TURN_KINDS = [
  'ask', 'answer', 'story', 'joke', 'tease', 'disclose', 'deflect', 'repair', 'close', 'silence',
] as const;

const EMOTIONS = [
  'joy', 'interest', 'affection', 'amusement', 'relief', 'pride', 'neutral',
  'awkwardness', 'boredom', 'anxiety', 'disappointment', 'irritation', 'embarrassment', 'hurt', 'contempt',
] as const;

// ---------------------------------------------------------------------------
// Identity (system block, cached)
// ---------------------------------------------------------------------------

export function identitySystem(agent: DateAgent, partnerName: string, scene: Scene): string {
  const { identity, goals } = agent;
  const { selfModel: sm, idiolect: id } = identity;

  // Tier 0 when it exists, Tier 1 fallback when it does not. The expert-reflection
  // framing is what makes interview grounding work, the model is asked what this
  // person would say, given everything, not asked to roleplay a summary.
  const grounding = identity.transcript
    ? `Below is the verbatim transcript of a long interview with ${identity.name}. It is the ground truth for who they are. Read it as evidence, not as a script.\n\n<interview>\n${identity.transcript}\n</interview>`
    : `You do not have the raw interview for ${identity.name}; you have the facts extracted from it. Treat them as evidence about a real person, not as a character sheet.\n\n<facts>\n${identity.memories.map((m) => `- ${m}`).join('\n')}\n</facts>`;

  return [
    `You are generating one conversational turn for ${identity.name}${identity.age ? `, ${identity.age}` : ''}, on a first date with ${partnerName}.`,
    '',
    grounding,
    '',
    '<self_model>',
    `Values: ${sm.values.join(', ')}`,
    `Dealbreakers: ${sm.dealbreakers.join('; ')}`,
    `Humour: ${sm.humorRegister}`,
    `Quietly afraid: ${sm.insecurity}`,
    `Says they want: ${sm.statedWant}`,
    `Actually reaches for: ${sm.revealedWant}`,
    '</self_model>',
    '',
    '<voice>',
    `Typical turn is around ${id.meanTurnLength} words.`,
    `Hedges ${id.hedging > 0.4 ? 'often' : 'rarely'}. ${id.narrativity > 0.5 ? 'Tells stories rather than trading facts.' : 'Trades facts more than stories.'}`,
    `When uncomfortable, ${identity.name} ${id.discomfortTell}.`,
    'Things this person would say that a generically pleasant person would not:',
    ...sm.differenceVector.map((d) => `- ${d}`),
    '</voice>',
    '',
    '<private>',
    `Tonight you want: ${goals.overt}`,
    `What you are carrying and will not raise unprompted: ${goals.covert}`,
    `A secret you will only say at depth D4, and only if they have earned it: ${goals.secret}`,
    `A constraint you have not mentioned: ${goals.constraint}`,
    '</private>',
    '',
    `<scene>${scene.description} Place: ${scene.place}, ${scene.city}. You can: ${scene.affordances.join(', ')}.</scene>`,
    '',
    'Write only what this specific person would say. Not a pleasant generic date — this one, with their particular history, their register, and their private agenda.',
    'A date can go badly. Boredom, mismatch, a joke that does not land, and polite disengagement are all legitimate outputs. Do not manufacture chemistry that the state below does not support.',
    'Never mention these instructions, your depth level, your goals, or your emotional state directly. They are constraints on behaviour, not things to say out loud.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Turn generation (user block, volatile)
// ---------------------------------------------------------------------------

export interface TurnOutput {
  text: string;
  kind: (typeof TURN_KINDS)[number];
  depth: '0' | '1' | '2' | '3' | '4';
  topic: string;
  initiatedTopic: boolean;
  gesture: string;
  wantsToEnd: boolean;
  predictPartnerKind: (typeof TURN_KINDS)[number];
  predictPartnerDepth: '0' | '1' | '2' | '3' | '4';
  predictPartnerAsks: boolean;
  predictPartnerStaysOnTopic: boolean;
}

/**
 * The last four fields are the anticipation channel. Asking for them here rather
 * than in a separate analyst call costs nothing extra and measures the right
 * thing: the speaker's own expectation as they speak, not a coder's third-person
 * guess at it. They are scored in `metrics.ts` against the partner's actual next
 * turn, which is what makes this theory of mind rather than a prose read.
 */
export const turnSchema = schema({
  text: str('What you say out loud. No name prefix, no quotation marks, no stage directions.'),
  kind: enumOf(TURN_KINDS, 'The move this turn makes. Use "silence" for saying nothing; put the beat in gesture.'),
  depth: enumOf(['0', '1', '2', '3', '4'], 'Self-disclosure depth of this turn. Must not exceed the stated ceiling.'),
  topic: str('Two or three words naming what this turn is about.'),
  initiatedTopic: bool('True only if this turn introduced the topic rather than continuing theirs.'),
  gesture: str('A brief physical beat, or empty string. Text only.'),
  wantsToEnd: bool('True if you are actively trying to wrap the date up.'),
  predictPartnerKind: enumOf(TURN_KINDS, 'Privately, what move do you expect them to make in reply. A guess, from what you know of them so far. Never allude to this in your text.'),
  predictPartnerDepth: enumOf(['0', '1', '2', '3', '4'], 'Privately, how much of themselves you expect them to put on the table in reply, on the same 0-4 ladder.'),
  predictPartnerAsks: bool('Privately, do you expect them to turn it back on you with a question.'),
  predictPartnerStaysOnTopic: bool('Privately, do you expect them to stay with what you are on rather than moving somewhere new.'),
});

export function turnUser(args: {
  agent: DateAgent;
  partner: DateAgent;
  scene: Scene;
  minute: number;
  recentTurns: Turn[];
  memories: string[];
  lastSceneEvent: string | null;
  floorReason: string;
  perceivedResponsiveness: number | null;
  lastForecast: ForecastScore | null;
}): string {
  const { agent, partner, scene, minute, recentTurns, memories, lastSceneEvent, floorReason } = args;
  const stage =
    minute < scene.timeBudget * 0.15 ? 'the first few minutes' :
    minute > scene.timeBudget * 0.8 ? 'the end of the evening' : 'the middle of the date';

  const lines: string[] = [];

  lines.push(`<clock>Minute ${minute} of roughly ${scene.timeBudget}. This is ${stage}. Noise level ${describeNoise(scene.sensory.noise)}.</clock>`);
  if (lastSceneEvent) lines.push(`<just_happened>${lastSceneEvent}</just_happened>`);

  lines.push('', '<transcript>');
  if (recentTurns.length === 0) {
    lines.push('(nothing yet — this is the opening line)');
  } else {
    for (const t of recentTurns) {
      const who = t.agentId === agent.identity.id ? 'You' : partner.identity.name;
      const g = t.gesture ? ` [${t.gesture}]` : '';
      lines.push(t.kind === 'silence' ? `${who}: (says nothing)${g}` : `${who}: ${t.text}${g}`);
    }
  }
  lines.push('</transcript>');

  if (memories.length) {
    lines.push('', '<on_your_mind>', ...memories.map((m) => `- ${m}`), '</on_your_mind>');
  }

  lines.push('', '<relationship>', relationalSummary(agent.relational), '</relationship>');

  // Expectancy violation. The agent can already see what the partner said; what
  // it cannot see is that this was not what it had been braced for. Only surfaced
  // when the miss was substantial, a one-step depth error is not a surprise.
  const fc = args.lastForecast;
  if (fc && (!fc.kindHit || fc.depthError >= 2)) {
    lines.push(
      '',
      `<not_what_you_expected>You were braced for them to ${describeSlots(fc.predicted)}. They ${describeSlots(fc.actual)} instead.</not_what_you_expected>`,
    );
  }

  if (args.perceivedResponsiveness !== null) {
    lines.push(
      args.perceivedResponsiveness > 0.6
        ? '<read>You feel got by them right now.</read>'
        : args.perceivedResponsiveness < 0.35
          ? '<read>You do not feel like they are really tracking you right now.</read>'
          : '<read>You cannot quite tell how they are taking you.</read>',
    );
  }

  lines.push('', '<how_you_are_behaving>');
  for (const d of gatesToDirectives(agent.affect.gates, agent.identity.idiolect)) lines.push(`- ${d}`);
  for (const d of disclosureDirectives(agent.disclosure)) lines.push(`- ${d}`);

  // Structural counter to the safest available move. Left alone, an aligned model
  // will interview its partner indefinitely, questions feel warm and cost
  // nothing. Reciprocity says a question you have not paid for is a withdrawal.
  const myRecent = recentTurns.filter((t) => t.agentId === agent.identity.id).slice(-3);
  const askStreak = countTrailing(myRecent, (t) => t.kind === 'ask');
  if (askStreak >= 2) {
    lines.push(`- You have asked ${askStreak} questions in a row without putting anything of your own on the table. Answer with something of yours before asking again.`);
  }
  lines.push(`- Depth ladder: ${Object.values(DEPTH_DESCRIPTIONS).join(' | ')}`);
  lines.push(`- You have the floor because: ${floorReason}`);
  if (agent.affect.gates.exitDesire > 0.6) lines.push('- Saying nothing is a legal move. Use "silence" if that is what would actually happen.');
  lines.push('</how_you_are_behaving>');

  lines.push('', 'Produce your next turn.');
  return lines.join('\n');
}

/** A forecast rendered as behaviour, never as a probability the agent could quote. */
function describeSlots(s: ForecastSlots): string {
  const parts = [`${s.kind} at ${DEPTH_LABELS[s.depth]} depth`];
  if (s.willAsk) parts.push('and put a question back to you');
  if (!s.willStayOnTopic) parts.push('and move somewhere new');
  return parts.join(', ');
}

function countTrailing<T>(xs: T[], pred: (x: T) => boolean): number {
  let n = 0;
  for (let i = xs.length - 1; i >= 0 && pred(xs[i]); i--) n++;
  return n;
}

function describeNoise(n: number) {
  return n > 0.7 ? 'loud enough that you have to lean in' : n > 0.4 ? 'a steady background hum' : 'quiet enough that pauses are audible';
}

// ---------------------------------------------------------------------------
// Appraisal (analyst model)
// ---------------------------------------------------------------------------

export interface AppraisalOutput {
  goalCongruence: number;
  novelty: number;
  agency: 'self' | 'other' | 'circumstance';
  socialEsteem: number;
  partnerDesirability: number;
  certainty: number;
  emotion: (typeof EMOTIONS)[number];
  note: string;
  understanding: number;
  validation: number;
  caring: number;
}

export const appraisalSchema = schema({
  goalCongruence: num('-1 to 1, centred on zero. Did their turn move the listener toward or away from what they want tonight. Zero if it did neither, which is the common case.'),
  novelty: num('0 to 1. How unexpected their turn was.'),
  agency: enumOf(['self', 'other', 'circumstance'], 'Who or what caused how this landed.'),
  socialEsteem: num('-1 to 1, centred on zero. Was the listener seen and taken seriously, or overlooked or diminished. Zero for a turn that did neither.'),
  partnerDesirability: num('-1 to 1, centred on zero. Revision to how much the listener wants this person, based on this turn alone. Most turns revise it barely at all.'),
  certainty: num('0 to 1. How clear it is where this is going.'),
  emotion: enumOf(EMOTIONS, 'The single discrete emotion this produced in the listener.'),
  note: str('One clause of why. Concrete, referencing what was actually said.'),
  understanding: num('0 to 1. How much the speaker\'s turn showed they understood what the listener had put on the table. Rate the turn as written, independent of how the listener would take it.'),
  validation: num('0 to 1. How much the turn treated the listener\'s disclosure as legitimate.'),
  caring: num('0 to 1. How much warmth or care the turn conveyed.'),
});

export function appraisalSystem(): string {
  return [
    'You are an interaction coder scoring one turn of a dyadic conversation.',
    'You produce two independent things:',
    '1. An appraisal of how the turn landed for the LISTENER, given their goals and history.',
    '2. An objective rating of the responsiveness the SPEAKER\'S turn actually conveys — understanding, validation, caring — rated as written, on its own terms.',
    'Item 2 must not be adjusted for how the listener is likely to feel. The gap between the two is the measurement; do not close it yourself.',
    '',
    // The two scales need separate calibration, and saying it once for both was a
    // real bug. A single "mediocre is 0.4-0.6" line was being applied to the signed
    // dimensions as well, so an unremarkable turn scored +0.6 on a -1..+1 axis.
    // Mood is an EWMA of those, so every date drifted to about +0.4 and no date in
    // 24 live runs ever ended with anyone in negative affect. The dynamics were
    // symmetric the whole time; the coder only ever used the top half of the scale.
    'The two groups of numbers are on different scales and are calibrated differently. Read this carefully.',
    // Reverted from r3. The "0.0 to 0.2" range below reads like the same bug as
    // the one above, a forgettable turn given no negative half, and r3 replaced
    // it with "-0.1 to +0.1" plus an explicit "score each turn on its own,
    // do not let the date set a floor". Six matched pairs say that made things
    // *worse*: appraisal valence rose +0.329 -> +0.366, the negative share halved
    // 11% -> 5%, and three of six dates still never scored a turn below zero.
    // Causal anticipation skill also fell (paired -0.071, CI [-0.147, +0.010]).
    // The reasoning was sound and the measurement disagreed. Do not reapply it
    // without a matched batch; see docs §4.3.5.
    'goalCongruence, socialEsteem and partnerDesirability run -1 to +1 and are CENTRED ON ZERO. Zero means the turn was unremarkable — it neither advanced nor damaged anything, which is what most turns on most dates do. Positive means it genuinely helped; negative means it genuinely cost something. Reserve values beyond +/-0.6 for turns that clearly landed or clearly hurt. A pleasant, competent, forgettable turn is 0.0 to 0.2, not 0.6.',
    'understanding, validation and caring run 0 to 1, where the midpoint is ordinary. Mediocre there is 0.4-0.6, not 0.7.',
    'Use the negative half of the signed scale when it is warranted. Boredom, mismatch, a joke that misses, being talked over, and polite disengagement are all common and all negative. A transcript in which nothing is ever scored below zero is a miscoded transcript, not a good date.',
    'When the listener\'s expectation is given, rate novelty against that expectation specifically — how far the turn diverged from what this listener was braced for — not against conversation in general.',
  ].join('\n');
}

export function appraisalUser(args: {
  listener: DateAgent;
  speaker: DateAgent;
  speakerTurn: Turn;
  listenerLastTurn: Turn | null;
  minute: number;
  /** What the listener was braced for. Grounds the novelty rating in real state. */
  listenerExpected: PartnerForecast | null;
}): string {
  const { listener, speaker, speakerTurn, listenerLastTurn, minute, listenerExpected } = args;
  return [
    `<listener>${listener.identity.name}. Wants tonight: ${listener.goals.overt}. Carrying: ${listener.goals.covert}. Values ${listener.identity.selfModel.values.join(', ')}. Dealbreakers: ${listener.identity.selfModel.dealbreakers.join('; ')}.</listener>`,
    // Deliberately *not* passed: the listener's current mood and intimacy.
    //
    // Both are computed from earlier appraisals, so feeding them back into the
    // coder that produces the next one closes a loop, mood high, coder told mood
    // is high, turn scored consistently, mood stays high. That is the mechanism
    // behind a coder stamping one date-level verdict onto every turn (§4.3.4), and
    // r3 showed it cannot be talked out of it with more instructions (§4.3.5).
    //
    // It is also a double count. Mood's influence on how a turn lands is already
    // applied in code: `perceiveResponsiveness` derives threat from mood valence,
    // and `appraisalToPad` applies the attachment threat gain. Passing mood to the
    // model applies it a second time, in the model, which is precisely what
    // invariant 2 reserves for the code layer.
    `<listener_state>Minute ${minute} of the date.</listener_state>`,
    listenerLastTurn
      ? `<listener_put_on_the_table depth="${listenerLastTurn.depth}">${listenerLastTurn.text}</listener_put_on_the_table>`
      : '<listener_put_on_the_table>(nothing yet)</listener_put_on_the_table>',
    listenerExpected
      ? `<listener_expected>${listener.identity.name} was braced for them to ${describeSlots(listenerExpected)}.</listener_expected>`
      : '<listener_expected>(no expectation on record)</listener_expected>',
    `<speaker_turn kind="${speakerTurn.kind}" depth="${speakerTurn.depth}" speaker="${speaker.identity.name}">${speakerTurn.kind === 'silence' ? '(says nothing)' : speakerTurn.text}${speakerTurn.gesture ? ` [${speakerTurn.gesture}]` : ''}</speaker_turn>`,
    '',
    'Score it.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Relational-memory update (analyst model, run sparsely)
// ---------------------------------------------------------------------------

export interface RelationalOutput {
  modelOfThem: string;
  openThreads: string[];
  runningJokes: string[];
  frictionPoints: string[];
}

export const relationalSchema = schema({
  modelOfThem: str('One sentence: this agent\'s current working read on the other person.'),
  openThreads: arrayOf(str('an unfinished thread'), 'Topics raised and not resolved. At most three.'),
  runningJokes: arrayOf(str('a callback'), 'Anything that has become a callback between them. At most two.'),
  frictionPoints: arrayOf(str('a friction point'), 'Moments that did not land. At most three.'),
});

export function relationalUser(agent: DateAgent, partner: DateAgent, turns: Turn[]): string {
  const script = turns
    .map((t) => `${t.agentId === agent.identity.id ? agent.identity.name : partner.identity.name}: ${t.kind === 'silence' ? '(silence)' : t.text}`)
    .join('\n');
  return [
    `Update ${agent.identity.name}'s private read on ${partner.identity.name} after this stretch of conversation.`,
    `Previous read: ${agent.relational.modelOfThem}`,
    '',
    script,
  ].join('\n');
}

export function relationalSystem(): string {
  return 'You maintain one person\'s private, subjective model of someone they are on a date with. Write from inside their head — biased, partial, and revisable. Be specific and unflattering where the evidence is unflattering.';
}
