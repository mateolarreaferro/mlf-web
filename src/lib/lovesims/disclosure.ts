/**
 * L4, Self-disclosure.
 *
 * Reis & Shaver's loop, made mechanical:
 *   disclosure → partner responsiveness → *perceived* responsiveness → intimacy
 *   → permission to go deeper.
 *
 * The load-bearing move is that perceived and actual responsiveness are separate
 * numbers. The gap between them is the single most valuable thing this product
 * can show a person, and it is computed here rather than narrated by a model.
 */

import { clamp } from './affect';
import type {
  Attachment,
  DisclosureDepth,
  DisclosureState,
  MoodGates,
  PAD,
  Responsiveness,
} from './types';

export const DEPTH_DESCRIPTIONS: Record<DisclosureDepth, string> = {
  0: 'D0 orient — facts. Where you live, what you do. No risk, no information.',
  1: 'D1 prefer — tastes and opinions. Music, food, cities, mild politics.',
  2: 'D2 narrate — personal history with stakes. Why you left that job, what the move was like.',
  3: 'D3 expose — current vulnerability. What you are afraid of, what you got wrong, what you want and have not found.',
  4: 'D4 core — the thing you do not tell people.',
};

export function initialDisclosure(): DisclosureState {
  return {
    intimacy: 0.05,
    reached: 0,
    ceiling: 1,
    given: 0,
    received: 0,
    secretRevealed: false,
    violations: 0,
  };
}

/**
 * How this agent reads the partner's responsiveness. Attachment biases each
 * component differently: anxious agents under-read validation under stakes,
 * avoidant agents specifically discount caring.
 */
export function perceiveResponsiveness(
  actual: Responsiveness,
  attachment: Attachment,
  mood: PAD,
  stakes: DisclosureDepth,
): Responsiveness {
  const threat = Math.max(0, -mood.valence);
  const stakeWeight = stakes / 4;

  let understanding = actual.understanding;
  let validation = actual.validation;
  let caring = actual.caring;

  switch (attachment) {
    case 'secure':
      // Reads it roughly as it is; a slight positive-charity effect.
      validation += 0.03;
      break;
    case 'anxious':
      // The higher the stakes, the more a neutral response reads as rejection.
      validation -= 0.10 + 0.22 * stakeWeight + 0.15 * threat;
      caring -= 0.06 + 0.14 * stakeWeight;
      understanding -= 0.05 * threat;
      break;
    case 'avoidant':
      // Warmth is discounted rather than disbelieved.
      caring -= 0.20 + 0.10 * stakeWeight;
      validation -= 0.08;
      break;
    case 'fearful':
      validation -= 0.12 + 0.18 * stakeWeight + 0.12 * threat;
      caring -= 0.18 + 0.10 * stakeWeight;
      understanding -= 0.08 * threat;
      break;
  }

  return {
    understanding: clamp(understanding, 0, 1),
    validation: clamp(validation, 0, 1),
    caring: clamp(caring, 0, 1),
  };
}

export function meanResponsiveness(r: Responsiveness): number {
  return (r.understanding + r.validation + r.caring) / 3;
}

/** perceived − actual, averaged. Negative means they under-read the partner. */
export function responsivenessGap(actual: Responsiveness, perceived: Responsiveness): number {
  return meanResponsiveness(perceived) - meanResponsiveness(actual);
}

/**
 * Advance intimacy from one perceived-responsiveness reading, then set the depth
 * ceiling for the next turn. Escalation only proceeds when responsiveness clears
 * a threshold; otherwise depth regresses.
 */
export function stepDisclosure(
  state: DisclosureState,
  perceived: Responsiveness,
  gates: MoodGates,
  /** The depth this agent had just put on the table when the partner replied. */
  stakes: DisclosureDepth,
): DisclosureState {
  const r = meanResponsiveness(perceived);
  const stakeWeight = 0.5 + stakes / 4;

  // Neutral sits at 0.45, not 0.5. Centring on 0.5 deadlocked the whole ladder:
  // ordinary decent responsiveness produced zero growth, so intimacy never rose,
  // so the ceiling never rose, so depth stayed at D1 and stakes stayed low. Worse,
  // a constant attachment bias of ~-0.10 meant anxious and avoidant agents could
  // never accumulate intimacy at all, which is far too strong a claim, insecure
  // attachment makes closeness harder to build and easier to lose, not impossible.
  //
  // EXPOSURE is mere-exposure drift: an hour in a bar with someone builds a little
  // familiarity on its own. Alone it is far too small to carry a date up the ladder,
  // so escalation still has to be earned.
  const EXPOSURE = 0.012;
  const raw = (r - 0.45) * 0.4 * stakeWeight + EXPOSURE;

  // Growth is scaled by the headroom left; loss is not.
  //
  // Without this the accumulator is an unbounded integrator with a positive
  // feedback loop wrapped around it, intimacy raises the ceiling, the ceiling
  // raises depth, depth raises stakeWeight to 1.5, which grows intimacy faster
  // still. Measured on a live 22-turn batch, two of six dates reached exactly
  // 1.00 by roughly the halfway mark and sat there. That is not closeness, it is
  // a clamp: once pinned, the whole back half of the date moves no state, and
  // every later reading of responsiveness is discarded. A measure that stops
  // measuring partway through is worse than a coarse one.
  //
  // Scaling by (1 - intimacy) makes it asymptotic instead: each warm turn buys
  // less than the last, which is also the better psychological claim, strangers
  // to comfortable is a larger move than close to closer. Losses stay unscaled,
  // so closeness remains easier to lose than to build at the top of the range.
  const delta = raw > 0 ? raw * (1 - state.intimacy) : raw;

  const intimacy = clamp(state.intimacy + delta, 0, 1);
  const ceiling = depthCeiling(intimacy, gates.disclosureWillingness, reciprocityDebt(state));

  return { ...state, intimacy, ceiling };
}

/** Positive means this agent has given more than they have received. */
export function reciprocityDebt(state: DisclosureState): number {
  const total = state.given + state.received;
  if (total === 0) return 0;
  return (state.given - state.received) / total;
}

function depthCeiling(
  intimacy: number,
  willingness: number,
  debt: number,
): DisclosureDepth {
  let byIntimacy: DisclosureDepth = 1;
  if (intimacy > 0.65) byIntimacy = 4;
  else if (intimacy > 0.40) byIntimacy = 3;
  else if (intimacy > 0.18) byIntimacy = 2;

  let byWillingness: DisclosureDepth = 0;
  if (willingness > 0.75) byWillingness = 4;
  else if (willingness > 0.55) byWillingness = 3;
  else if (willingness > 0.35) byWillingness = 2;
  else if (willingness > 0.18) byWillingness = 1;

  let ceiling = Math.min(byIntimacy, byWillingness) as DisclosureDepth;

  // Carrying the intimacy alone pulls you back down: the under-reciprocation
  // failure mode. Withdrawal, not escalation.
  if (debt > 0.35 && ceiling > 1) ceiling = (ceiling - 1) as DisclosureDepth;

  return ceiling;
}

/** Record a turn's disclosure on both ledgers and detect too-much-too-soon. */
export function recordDisclosure(
  speaker: DisclosureState,
  listener: DisclosureState,
  depth: DisclosureDepth,
): { speaker: DisclosureState; listener: DisclosureState; violation: boolean } {
  // A violation is depth that outruns both the relationship and the partner:
  // D3+ offered when the partner is still two levels shallower.
  const violation = depth >= 3 && depth - listener.reached >= 2 && speaker.intimacy < 0.4;

  const nextSpeaker: DisclosureState = {
    ...speaker,
    given: speaker.given + depth,
    reached: Math.max(speaker.reached, depth) as DisclosureDepth,
    violations: speaker.violations + (violation ? 1 : 0),
    secretRevealed: speaker.secretRevealed || depth === 4,
    intimacy: violation ? clamp(speaker.intimacy - 0.08, 0, 1) : speaker.intimacy,
  };
  const nextListener: DisclosureState = {
    ...listener,
    received: listener.received + depth,
    intimacy: violation ? clamp(listener.intimacy - 0.12, 0, 1) : listener.intimacy,
  };

  return { speaker: nextSpeaker, listener: nextListener, violation };
}

/**
 * Directives handed to the voice model.
 *
 * The ceiling is a cap, but a cap alone produces a date that never climbs: an
 * aligned model reads "you may go deeper" as "you may keep asking safe
 * questions", and stays at D1 forever. Reis & Shaver's loop says the opposite -
 * demonstrated responsiveness is what *licenses and invites* escalation. So when
 * the ceiling has risen above what this agent has actually offered, that gap has
 * to be rendered as pressure, not permission.
 */
export function disclosureDirectives(state: DisclosureState): string[] {
  const out: string[] = [];
  out.push(`Ceiling for this turn: ${DEPTH_DESCRIPTIONS[state.ceiling]}`);

  if (state.ceiling > state.reached) {
    out.push(
      `They have earned more than you have given them. You have only gone as far as D${state.reached}; ` +
        `there is an opening for D${state.ceiling} here. Take it if something true fits — do not ask another ` +
        `question instead.`,
    );
  } else if (state.ceiling < state.reached) {
    out.push(`You have pulled back from where you were. Stay at D${state.ceiling}; you are not offering more right now.`);
  }

  if (state.intimacy > 0.3 && state.reached <= 1) {
    out.push('You have kept this entirely at the level of tastes and opinions. By now that is a conspicuous choice.');
  }

  const debt = reciprocityDebt(state);
  if (debt > 0.35) {
    out.push('You have been carrying this conversation. You are aware they have not matched you.');
  } else if (debt < -0.35) {
    out.push('They have opened up more than you have. You notice the imbalance, and so do they.');
  }

  if (state.intimacy > 0.6) out.push('There is real closeness here by now.');
  else if (state.intimacy < 0.15) out.push('This still feels like two strangers.');
  return out;
}
