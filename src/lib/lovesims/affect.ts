/**
 * L3, Affect.
 *
 * The rule this file exists to enforce: emotion is state that biases generation,
 * not text that describes feeling. Nothing here writes prose. The appraisal comes
 * from the analyst model as numbers; the mapping to PAD, the mood dynamics, and
 * the gates are all code, so that *personality modulates appraisal* rather than
 * personality modulating the wording of an output.
 */

import type {
  AffectState,
  Appraisal,
  Attachment,
  Idiolect,
  MoodGates,
  PAD,
  Scene,
} from './types';

interface AttachmentProfile {
  /** Multiplier on negative valence. Anxious agents feel slights harder. */
  threatGain: number;
  /** Multiplier on positive social esteem. Avoidant agents discount warmth. */
  esteemGain: number;
  /**
   * How disclosure willingness responds to accumulated intimacy.
   * Negative is the whole point: an avoidant agent gets terser exactly when
   * things are going well.
   */
  intimacyPull: number;
  /** How much a threat appraisal *raises* disclosure (reassurance-seeking). */
  reassuranceSeeking: number;
  /** Damping on outward warmth. */
  warmthDamp: number;
}

export const ATTACHMENT_PROFILES: Record<Attachment, AttachmentProfile> = {
  secure: { threatGain: 1.0, esteemGain: 1.0, intimacyPull: 0.15, reassuranceSeeking: 0.0, warmthDamp: 1.0 },
  anxious: { threatGain: 1.7, esteemGain: 1.35, intimacyPull: 0.25, reassuranceSeeking: 0.35, warmthDamp: 1.05 },
  avoidant: { threatGain: 1.1, esteemGain: 0.6, intimacyPull: -0.5, reassuranceSeeking: -0.15, warmthDamp: 0.75 },
  fearful: { threatGain: 1.6, esteemGain: 0.75, intimacyPull: -0.3, reassuranceSeeking: 0.15, warmthDamp: 0.8 },
};

const MOOD_ALPHA = 0.25; // slow
const EMOTION_DECAY = 0.55; // fast, ~2–3 turns
const CONTAGION = 0.18;

export function initialAffect(): AffectState {
  const mood: PAD = { valence: 0.05, arousal: 0.25, dominance: 0 };
  const emotion: PAD = { valence: 0, arousal: 0, dominance: 0 };
  return {
    mood,
    emotion,
    label: 'neutral',
    arousalBudget: 1,
    gates: baseGates(),
  };
}

function baseGates(): MoodGates {
  return {
    verbosity: 0.5,
    questionRate: 0.35,
    disclosureWillingness: 0.5,
    warmth: 0.5,
    riskAppetite: 0.5,
    topicInitiative: 0.5,
    exitDesire: 0.1,
  };
}

/**
 * Appraisal dimensions → a PAD delta, with attachment applied to the appraisal
 * *inputs*. This is the highest-leverage line in the architecture: one set of
 * coefficients produces the most recognisable dynamics in modern dating.
 */
export function appraisalToPad(appraisal: Appraisal, attachment: Attachment): PAD {
  const p = ATTACHMENT_PROFILES[attachment];

  const goal = appraisal.goalCongruence < 0
    ? appraisal.goalCongruence * p.threatGain
    : appraisal.goalCongruence;
  const esteem = appraisal.socialEsteem < 0
    ? appraisal.socialEsteem * p.threatGain
    : appraisal.socialEsteem * p.esteemGain;

  const valence = clamp(0.5 * goal + 0.35 * esteem + 0.2 * appraisal.partnerDesirability, -1, 1);
  const arousal = clamp(
    0.45 * appraisal.novelty + 0.35 * Math.abs(goal) + 0.3 * (1 - appraisal.certainty),
    -1,
    1,
  );
  const dominance = clamp(
    0.35 * goal + 0.3 * appraisal.certainty - (appraisal.agency === 'other' ? 0.25 : 0),
    -1,
    1,
  );

  return { valence, arousal, dominance };
}

/**
 * Advance one agent's affect. `partnerMood` drives contagion, mutual escalation
 * and mutual deadening are both real and both diagnostic.
 */
export function stepAffect(
  state: AffectState,
  appraisal: Appraisal,
  attachment: Attachment,
  idiolect: Idiolect,
  scene: Scene,
  intimacy: number,
  partnerMood: PAD | null,
  minutesElapsed: number,
): AffectState {
  const delta = appraisalToPad(appraisal, attachment);

  const emotion: PAD = {
    valence: clamp(state.emotion.valence * EMOTION_DECAY + delta.valence, -1, 1),
    arousal: clamp(state.emotion.arousal * EMOTION_DECAY + delta.arousal, -1, 1),
    dominance: clamp(state.emotion.dominance * EMOTION_DECAY + delta.dominance, -1, 1),
  };

  let mood: PAD = {
    valence: ewma(state.mood.valence, delta.valence, MOOD_ALPHA),
    arousal: ewma(state.mood.arousal, delta.arousal, MOOD_ALPHA),
    dominance: ewma(state.mood.dominance, delta.dominance, MOOD_ALPHA),
  };

  if (partnerMood) {
    mood = {
      valence: clamp(mood.valence + CONTAGION * (partnerMood.valence - mood.valence), -1, 1),
      arousal: clamp(mood.arousal + CONTAGION * (partnerMood.arousal - mood.arousal), -1, 1),
      dominance: mood.dominance,
    };
  }

  // Embodiment-lite: a 90-minute date depletes. A loud room burns it faster.
  const fatigue = minutesElapsed / Math.max(scene.timeBudget, 1);
  const arousalBudget = clamp(1 - fatigue * (0.55 + 0.25 * scene.sensory.noise), 0.15, 1);

  const next: AffectState = {
    mood,
    emotion,
    label: appraisal.emotion,
    arousalBudget,
    gates: baseGates(),
  };
  next.gates = computeGates(next, attachment, idiolect, scene, intimacy);
  return next;
}

/**
 * The only channel from affect to generation. Rendered into the prompt as
 * behavioural directives, never as "you are feeling X".
 */
export function computeGates(
  state: AffectState,
  attachment: Attachment,
  idiolect: Idiolect,
  scene: Scene,
  intimacy: number,
): MoodGates {
  const p = ATTACHMENT_PROFILES[attachment];
  const eff: PAD = {
    valence: clamp(state.mood.valence + 0.6 * state.emotion.valence, -1, 1),
    arousal: clamp(state.mood.arousal + 0.6 * state.emotion.arousal, -1, 1),
    dominance: clamp(state.mood.dominance + 0.6 * state.emotion.dominance, -1, 1),
  };
  const threat = Math.max(0, -eff.valence);

  const verbosity = clamp(
    (0.5 + 0.28 * eff.valence + 0.22 * eff.arousal) * (0.55 + 0.45 * state.arousalBudget),
    0.12,
    1,
  );

  const questionRate = clamp(idiolect.questionRate + 0.25 * eff.valence - 0.15 * threat, 0.05, 0.95);

  // The asymmetry that makes avoidance legible: willingness falls as intimacy
  // rises, so the agent goes terse exactly when the date is going well.
  const disclosureWillingness = clamp(
    0.5 +
      0.35 * eff.valence +
      p.intimacyPull * intimacy +
      p.reassuranceSeeking * threat -
      0.2 * scene.sensory.noise,
    0.05,
    1,
  );

  const warmth = clamp((0.5 + 0.4 * eff.valence) * p.warmthDamp, 0.05, 1);
  const riskAppetite = clamp(0.45 + 0.3 * eff.valence + 0.2 * eff.dominance, 0.05, 1);
  const topicInitiative = clamp(0.45 + 0.3 * eff.dominance + 0.2 * eff.arousal, 0.05, 1);
  const exitDesire = clamp(
    0.08 - 0.5 * eff.valence + 0.35 * (1 - state.arousalBudget) + 0.2 * scene.sensory.crowding * threat,
    0,
    1,
  );

  return { verbosity, questionRate, disclosureWillingness, warmth, riskAppetite, topicInitiative, exitDesire };
}

/**
 * Render gates as instructions. This is what the voice model actually reads -
 * behaviour, not feeling, so that the emotion model shows up in what the agent
 * does rather than in adjectives it uses about itself.
 */
export function gatesToDirectives(gates: MoodGates, idiolect: Idiolect): string[] {
  const out: string[] = [];
  const words = Math.round(idiolect.meanTurnLength * (0.4 + 1.2 * gates.verbosity));
  out.push(`Target roughly ${words} words. Do not pad to reach it.`);

  if (gates.questionRate > 0.55) out.push('You are curious right now: ask something.');
  else if (gates.questionRate < 0.2) out.push('You are not asking questions right now.');

  if (gates.disclosureWillingness < 0.3) out.push('You are guarding. Answer without elaborating; redirect if pressed.');
  else if (gates.disclosureWillingness > 0.7) out.push('You are willing to say something real if there is an opening.');

  if (gates.warmth < 0.3) out.push('Your warmth markers are down: fewer compliments, less mirroring.');
  else if (gates.warmth > 0.7) out.push('You are warm: mirror their energy, acknowledge what they said.');

  if (gates.riskAppetite > 0.7) out.push('You are willing to say the slightly risky thing.');
  if (gates.topicInitiative > 0.65) out.push('You are driving: introduce a direction rather than following.');
  else if (gates.topicInitiative < 0.3) out.push('You are following their lead, not steering.');

  if (gates.exitDesire > 0.6) out.push('You want this to wind down. Start moving toward an exit.');
  else if (gates.exitDesire > 0.35) out.push('Your attention is starting to drift.');

  return out;
}

function ewma(prev: number, next: number, alpha: number) {
  return clamp(prev * (1 - alpha) + next * alpha, -1, 1);
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
