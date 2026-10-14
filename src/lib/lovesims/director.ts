/**
 * L6, Dialogue mechanics.
 *
 * This replaces `if (i % 2 == 0)`. Each agent bids for the floor from its own
 * state; the director grants it. That one change is what makes interruptions,
 * double-turns, dead air, topic initiative, and early exits expressible at all.
 *
 * Bids are computed, not asked of a model: deterministic, cheap, and auditable.
 */

import type { DateAgent, FloorBid, Scene, Turn } from './types';

export interface FloorDecision {
  speaker: DateAgent;
  listener: DateAgent;
  reason: string;
  /** True when neither agent had much to say, a real lull, worth counting. */
  deadAir: boolean;
}

export function allocateFloor(
  a: DateAgent,
  b: DateAgent,
  turns: Turn[],
  rng: () => number,
): FloorDecision {
  const last = turns[turns.length - 1] ?? null;
  const bids = [bid(a, b, turns, last, rng), bid(b, a, turns, last, rng)];
  bids.sort((x, y) => y.urgency - x.urgency);

  let winnerId = bids[0].agentId;
  let reason = bids[0].reason;
  const deadAir = bids[0].urgency < 0.34;

  // A double-turn is allowed, but only when someone genuinely has momentum and
  // is not sitting on an unanswered question.
  if (last && last.agentId === winnerId) {
    const momentum = bids[0].urgency - bids[1].urgency;
    if (!(momentum > 0.15 && last.kind !== 'ask')) {
      winnerId = bids[1].agentId;
      reason = bids[1].reason;
    } else {
      reason = 'you kept going without waiting for them';
    }
  }

  if (deadAir) reason = 'the pause got long enough that someone had to break it';

  const speaker = winnerId === a.identity.id ? a : b;
  const listener = winnerId === a.identity.id ? b : a;
  return { speaker, listener, reason, deadAir };
}

function bid(
  self: DateAgent,
  other: DateAgent,
  turns: Turn[],
  last: Turn | null,
  rng: () => number,
): FloorBid {
  const g = self.affect.gates;
  let urgency = 0.35;
  let reason = 'it was your turn';

  if (last && last.agentId === other.identity.id) {
    if (last.kind === 'ask') {
      urgency += 0.5;
      reason = 'they asked you something';
    } else {
      urgency += 0.15;
      reason = 'they left you an opening';
    }
  }

  if (last && last.agentId === self.identity.id) {
    // Having just spoken is a handicap, not a bar. Asking a question is the one
    // move that genuinely hands the floor over; everything else can leave
    // momentum with the speaker. A penalty large enough to always lose here is
    // just `i % 2` with extra steps.
    urgency -= last.kind === 'ask' ? 0.9 : 0.3;
    reason = 'you were still talking';
  }

  urgency += 0.3 * g.topicInitiative;
  urgency += 0.2 * g.riskAppetite;
  urgency += 0.25 * g.exitDesire; // wanting out is also a reason to speak
  urgency -= 0.2 * (1 - g.verbosity);

  if (g.topicInitiative > 0.65 && (!last || last.agentId === self.identity.id)) {
    reason = 'you wanted to steer';
  }
  if (g.exitDesire > 0.6) reason = 'you were looking for a way to wrap up';

  const sinceSpoke = turns.length - self.lastSpokeAt;
  if (self.lastSpokeAt >= 0 && sinceSpoke > 3) urgency += 0.15;

  urgency += (rng() - 0.5) * 0.14;

  return { agentId: self.identity.id, urgency, reason };
}

/** How much clock a turn consumes. Silences and short turns cost less. */
export function minutesForTurn(turn: { kind: string; text: string }, scene: Scene): number {
  if (turn.kind === 'silence') return 0.7;
  const words = turn.text.trim().split(/\s+/).length;
  const base = 0.35 + words / 55;
  // A loud room slows everything down: repeats, leaning in.
  return base * (1 + 0.3 * scene.sensory.noise);
}

export interface EndCheck {
  ended: boolean;
  reason: string;
}

export function checkEnd(args: {
  a: DateAgent;
  b: DateAgent;
  minute: number;
  turnIndex: number;
  maxTurns: number;
  scene: Scene;
  wantsToEnd: Record<string, boolean>;
  lastTurn: Turn | null;
}): EndCheck {
  const { a, b, minute, turnIndex, maxTurns, scene, wantsToEnd, lastTurn } = args;

  if (turnIndex >= maxTurns) return { ended: true, reason: 'turn ceiling reached' };
  if (minute >= scene.timeBudget) return { ended: true, reason: 'the evening ran out' };

  const bail = [a, b].find((x) => x.affect.gates.exitDesire > 0.86);
  if (bail && turnIndex > 5) {
    return { ended: true, reason: `${bail.identity.name} wanted out` };
  }

  const bothDone = wantsToEnd[a.identity.id] && wantsToEnd[b.identity.id];
  if (bothDone && turnIndex > 6) return { ended: true, reason: 'they wound it down together' };

  const oneDoneLate = (wantsToEnd[a.identity.id] || wantsToEnd[b.identity.id]) && minute > scene.timeBudget * 0.7;
  if (oneDoneLate && lastTurn?.kind === 'close') return { ended: true, reason: 'one of them closed it out' };

  return { ended: false, reason: '' };
}
