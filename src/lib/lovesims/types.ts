/**
 * LoveSims v2, typed simulation state.
 *
 * The organising principle of this rewrite: every psychological claim the product
 * makes must correspond to a field in here that a generator actually reads. If a
 * component only produces words about emotion, it is not an emotion model.
 */

// ---------------------------------------------------------------------------
// L1, Identity
// ---------------------------------------------------------------------------

export type Attachment = 'secure' | 'anxious' | 'avoidant' | 'fearful';

/** Tier 2: how someone talks, held separately from what they know. */
export interface Idiolect {
  /** Rough words-per-turn the agent gravitates to. */
  meanTurnLength: number;
  /** 0–1: how often their turns contain a question. */
  questionRate: number;
  /** 0–1: hedging, softeners, "kind of", "I guess". */
  hedging: number;
  /** 0–1: story-telling vs. fact-trading. */
  narrativity: number;
  /** Verbatim-ish lines that pin the voice. */
  exemplars: string[];
  /** What they do when uncomfortable, deflect, joke, over-explain, go quiet. */
  discomfortTell: string;
}

/** Tier 1: the structured self-model. Editable by the user in the product. */
export interface SelfModel {
  values: string[];
  dealbreakers: string[];
  attachment: Attachment;
  humorRegister: string;
  insecurity: string;
  /** What they say they want vs. what they actually reach for. */
  statedWant: string;
  revealedWant: string;
  /** L1 anti-collapse device: things a generically pleasant person would not say. */
  differenceVector: string[];
}

export interface AgentIdentity {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  /** Tier 0, verbatim interview text. Null when raw_data/ is unavailable. */
  transcript: string | null;
  /** Fallback grounding when Tier 0 is absent: extracted interview facts. */
  memories: string[];
  persona: string;
  selfModel: SelfModel;
  idiolect: Idiolect;
}

// ---------------------------------------------------------------------------
// L2, Memory
// ---------------------------------------------------------------------------

export type MemoryKind = 'episodic' | 'semantic' | 'procedural' | 'relational';

export interface MemoryTrace {
  id: string;
  kind: MemoryKind;
  text: string;
  /** 0–1. Decays without reinforcement; gates what surfaces. */
  salience: number;
  /** Turn index of last retrieval, -1 if never. */
  lastRecalledAt: number;
  /** Valence the memory carries, for mood-congruent recall. */
  valence: number;
}

/** Per-dyad memory: what this relationship, specifically, contains. */
export interface RelationalMemory {
  /** What I have told them, by depth. */
  toldThem: { depth: DisclosureDepth; topic: string; turn: number }[];
  /** What they have told me. */
  theyToldMe: { depth: DisclosureDepth; topic: string; turn: number }[];
  openThreads: string[];
  runningJokes: string[];
  frictionPoints: string[];
  /** My current working model of them, revised as the date runs. */
  modelOfThem: string;
}

// ---------------------------------------------------------------------------
// L3, Affect
// ---------------------------------------------------------------------------

export type EmotionLabel =
  | 'joy' | 'interest' | 'affection' | 'amusement' | 'relief' | 'pride'
  | 'neutral'
  | 'awkwardness' | 'boredom' | 'anxiety' | 'disappointment'
  | 'irritation' | 'embarrassment' | 'hurt' | 'contempt';

/** Pleasure–Arousal–Dominance. Each component is -1..1. */
export interface PAD {
  valence: number;
  arousal: number;
  dominance: number;
}

/**
 * The appraisal an agent makes of the partner's last turn. These dimensions are
 * the OCC/EMA lineage; the mapping from here to PAD is done in code so that
 * personality modulates appraisal rather than modulating output text.
 */
export interface Appraisal {
  /** -1..1. Did that move me toward or away from what I want here. */
  goalCongruence: number;
  /** 0..1. Expected or surprising. */
  novelty: number;
  agency: 'self' | 'other' | 'circumstance';
  /** -1..1. Was I seen, ignored, or diminished. */
  socialEsteem: number;
  /** -1..1. Revision to how much I want this person. */
  partnerDesirability: number;
  /** 0..1. Do I know where this is going. */
  certainty: number;
  emotion: EmotionLabel;
  /** One clause of why, for the debrief, never fed back as state. */
  note: string;
}

/** Understanding / validation / caring, Reis & Shaver's decomposition. */
export interface Responsiveness {
  understanding: number;
  validation: number;
  caring: number;
}

/**
 * Mood gates: the only channel through which affect reaches generation. Each is
 * 0–1 and is rendered into the prompt as a behavioural directive, never as
 * "you feel sad".
 */
export interface MoodGates {
  verbosity: number;
  questionRate: number;
  disclosureWillingness: number;
  warmth: number;
  riskAppetite: number;
  topicInitiative: number;
  exitDesire: number;
}

export interface AffectState {
  /** Slow, EWMA across the date. */
  mood: PAD;
  /** Fast, decays over ~2–3 turns. */
  emotion: PAD;
  label: EmotionLabel;
  gates: MoodGates;
  /** Depletes over the date; low arousal budget shortens turns. */
  arousalBudget: number;
}

/** One row of the debrief's affect track. */
export interface AffectRecord {
  turn: number;
  minute: number;
  agentId: string;
  appraisal: Appraisal;
  label: EmotionLabel;
  mood: PAD;
  emotion: PAD;
  gates: MoodGates;
  /** What the partner's turn actually conveyed. */
  actualResponsiveness: Responsiveness;
  /** What this agent read it as, after their own bias. */
  perceivedResponsiveness: Responsiveness;
  /** perceived - actual, averaged. Negative = they under-read the partner. */
  responsivenessGap: number;
  intimacy: number;
  /** The listener's disclosure ceiling after this step. */
  ceiling: DisclosureDepth;
}

// ---------------------------------------------------------------------------
// L4, Self-disclosure
// ---------------------------------------------------------------------------

/** Social penetration depth. D0 orient → D4 core. */
export type DisclosureDepth = 0 | 1 | 2 | 3 | 4;

export const DEPTH_LABELS: Record<DisclosureDepth, string> = {
  0: 'orient',
  1: 'prefer',
  2: 'narrate',
  3: 'expose',
  4: 'core',
};

export interface DisclosureState {
  /** Running intimacy for this agent toward the partner, 0–1. */
  intimacy: number;
  /** Deepest level this agent has reached. */
  reached: DisclosureDepth;
  /** Ceiling for the next turn, set by the responsiveness loop. */
  ceiling: DisclosureDepth;
  /** Sum of depths given vs. received, drives the reciprocity drive. */
  given: number;
  received: number;
  /** Has the secret come out. */
  secretRevealed: boolean;
  /** Count of too-much-too-soon events this agent committed. */
  violations: number;
}

// ---------------------------------------------------------------------------
// L5, Scene
// ---------------------------------------------------------------------------

export interface SceneEventSpec {
  id: string;
  /** What the director narrates when this fires. */
  text: string;
  /** Rough arousal nudge it delivers to both parties. */
  arousal: number;
  valence: number;
}

export interface Scene {
  id: string;
  name: string;
  /** Real place + city, this is what grounds bridge-to-real suggestions. */
  place: string;
  city: string;
  affordances: string[];
  sensory: {
    /** 0–1. High noise raises arousal and suppresses disclosure depth. */
    noise: number;
    lighting: string;
    crowding: number;
  };
  /** Minutes. A date has a budget. */
  timeBudget: number;
  eventPool: SceneEventSpec[];
  description: string;
}

// ---------------------------------------------------------------------------
// L6, Dialogue mechanics
// ---------------------------------------------------------------------------

export type TurnKind =
  | 'ask' | 'answer' | 'story' | 'joke' | 'tease'
  | 'disclose' | 'deflect' | 'repair' | 'close' | 'silence';

export interface Turn {
  index: number;
  minute: number;
  agentId: string;
  kind: TurnKind;
  text: string;
  gesture: string | null;
  depth: DisclosureDepth;
  /** The ceiling in force when this turn was produced. depth <= ceiling always. */
  ceiling: DisclosureDepth;
  /** True when the model asked for more depth than the ceiling allowed. */
  clamped: boolean;
  topic: string;
  /** True when this turn introduced the topic rather than continuing one. */
  initiatedTopic: boolean;
  /** Why the director gave this agent the floor. */
  floorReason: string;
}

/** A bid for the floor. Computed from state, not asked of a model. */
export interface FloorBid {
  agentId: string;
  urgency: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// L6b, Anticipation
// ---------------------------------------------------------------------------

/**
 * What an agent expects the partner to do on their next turn.
 *
 * This is the falsifiable half of theory of mind. `RelationalMemory.modelOfThem`
 * is the other half, a prose read on the partner, and prose reads cannot be
 * scored. A forecast can: the partner's next turn either matches it or does not.
 * Emitted by the voice model alongside the turn itself, so it costs no extra
 * call and reflects the speaker's own expectation rather than a coder's guess.
 */
export interface PartnerForecast {
  /** Turn index this forecast was made on. It predicts the partner's next turn. */
  madeAtTurn: number;
  /** Who is doing the predicting. */
  agentId: string;
  kind: TurnKind;
  depth: DisclosureDepth;
  /** Will they turn it back on me with a question. */
  willAsk: boolean;
  /** Will they stay with what we are on, rather than moving somewhere new. */
  willStayOnTopic: boolean;
}

/** The four slots of a forecast, as predicted or as they actually came out. */
export interface ForecastSlots {
  kind: TurnKind;
  depth: DisclosureDepth;
  willAsk: boolean;
  willStayOnTopic: boolean;
}

export interface ForecastScore {
  /** The turn the forecast was scored against. */
  turn: number;
  madeAtTurn: number;
  /** The agent who made the prediction. */
  agentId: string;
  predicted: ForecastSlots;
  actual: ForecastSlots;
  kindHit: boolean;
  /** |predicted − actual| on the 0–4 ladder. */
  depthError: number;
  askHit: boolean;
  topicHit: boolean;
  /** Weighted composite of the four slots, 0–1. */
  accuracy: number;
}

// ---------------------------------------------------------------------------
// L7, Goals and secrets
// ---------------------------------------------------------------------------

export interface PrivateGoals {
  /** What they'd say they want tonight. */
  overt: string;
  /** What they're carrying and won't mention unprompted. */
  covert: string;
  /** Disclosable only above a responsiveness threshold. */
  secret: string;
  /** Non-romantic constraint: "home by ten", "don't talk about work". */
  constraint: string;
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export interface DateAgent {
  identity: AgentIdentity;
  goals: PrivateGoals;
  affect: AffectState;
  disclosure: DisclosureState;
  relational: RelationalMemory;
  traces: MemoryTrace[];
  /**
   * The forecast this agent is currently holding about the partner's next turn.
   * Cleared when the partner speaks and the forecast is scored. Overwritten if
   * this agent speaks twice in a row, the newer expectation supersedes.
   */
  pendingForecast: PartnerForecast | null;
  /** Turn index this agent last spoke on. */
  lastSpokeAt: number;
  /** History across previous simulated dates, the cross-date memory hook. */
  priorDates: number;
}

export interface DateConfig {
  agentAId: string;
  agentBId: string;
  sceneId: string;
  /** Hard ceiling. The date normally ends before this. */
  maxTurns: number;
  seed: number;
  /** Set false to run entirely on the deterministic mock provider. */
  live: boolean;
}

export type DateEvent =
  | { type: 'start'; scene: Scene; agents: { id: string; name: string; goals: PrivateGoals }[] }
  | { type: 'turn'; turn: Turn }
  | { type: 'affect'; record: AffectRecord }
  | { type: 'forecast'; score: ForecastScore }
  | { type: 'scene_event'; minute: number; text: string }
  | { type: 'end'; reason: string; minutes: number; turns: number }
  | { type: 'debrief'; debrief: Debrief }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/**
 * How well this agent predicted the partner's next move.
 *
 * `baseline` is what you would score by always guessing the partner's modal
 * behaviour on this date, computed after the fact, so it is a hard baseline,
 * not a straw one. `skill` is the only number here worth reading on its own:
 * raw accuracy mostly reflects how predictable the partner was.
 */
export interface AnticipationMetrics {
  /** Forecasts that were made and got scored against a real turn. */
  forecasts: number;
  kindAccuracy: number;
  /** Mean absolute error on the 0–4 depth ladder. */
  depthMae: number;
  askAccuracy: number;
  topicAccuracy: number;
  composite: number;
  baseline: number;
  /** composite − baseline. Positive means the read beat guessing the mode. */
  skill: number;
  /**
   * The same comparison without hindsight: at each forecast the baseline may only
   * use the partner's turns already observed. `baseline` above is fitted over the
   * whole date, which at ten forecasts flatters it; this one is what a naive
   * forecaster could actually have done at the time. Computed over the forecasts
   * that have at least one prior observation, so `causalSkill` is the difference
   * of two means taken on that same subset.
   */
  causalBaseline: number;
  causalSkill: number;
  /** How many forecasts the causal comparison covers. */
  causalFrom: number;
}

export interface PerAgentMetrics {
  agentId: string;
  name: string;
  turns: number;
  meanTurnWords: number;
  /** questions / total turns. */
  questionRatio: number;
  /** Share of topics this agent introduced. */
  topicInitiative: number;
  /** Turns that built on the partner's previous content. */
  uptakeRate: number;
  deepestDepth: DisclosureDepth;
  disclosureGiven: number;
  disclosureReceived: number;
  repairAttempts: number;
  /** Mean of perceived minus actual responsiveness. */
  responsivenessGap: number;
  positivityRatio: number;
  finalMoodValence: number;
  violations: number;
  /**
   * Shannon entropy over this agent's turn kinds, normalised against the ten
   * available. The negotiation literature's "blind proposing" measure, ported:
   * an agent with ten moves available that only ever uses two is not conversing,
   * it is running a script. Low entropy plus high `safeMoveRatio` is the
   * pleasantness collapse showing up per-agent rather than in the outcome rate.
   */
  kindEntropy: number;
  /** Share of turns spent on the two moves that cost nothing: ask and answer. */
  safeMoveRatio: number;
  /** Empathic accuracy: how well this agent called the partner's next move. */
  anticipation: AnticipationMetrics;
}

export interface Moment {
  turn: number;
  minute: number;
  kind: 'peak' | 'rupture' | 'repair' | 'deepest' | 'gap' | 'misread';
  label: string;
  excerpt: string;
  /** Why this moment was selected, evidence, not interpretation. */
  evidence: string;
}

export interface Debrief {
  /** Language style matching, 0–1. Function-word synchrony. */
  lsm: number;
  /** Disclosure reciprocity: 1.0 = perfectly balanced. */
  reciprocityIndex: number;
  deadAirEvents: number;
  mutualInterest: boolean;
  /**
   * The continuous form of `mutualInterest`, and the one to report.
   *
   * The boolean is a conjunction of six threshold crossings, which makes it far
   * more fragile than anything it is built from. Measured across two identical
   * live batches, peak intimacy reproduced per pair at ICC 0.985, but the
   * mutual-interest rate swung 33% to 17%, because a six-way AND flips whenever
   * any single condition happens to sit near its line. The instability was
   * manufactured by the metric, not present in the simulation.
   *
   * `margin` is the signed slack on the tightest condition: positive means all
   * six cleared, and the magnitude says how robustly. A date at +0.01 and one at
   * +0.30 are very different things that the boolean calls identical.
   */
  mutualInterestMargin: number;
  /** Which condition is closest to flipping. Names the argmin behind `margin`. */
  mutualInterestBinding: string;
  perAgent: PerAgentMetrics[];
  moments: Moment[];
  affectTrack: AffectRecord[];
  /** Every forecast that got scored, in turn order. */
  forecastScores: ForecastScore[];
  /** Shared topics with turn citations, the bridge-to-real input. */
  sharedInterests: { topic: string; turns: number[]; sustainedTurns: number }[];
}
